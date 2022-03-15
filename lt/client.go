package main

import (
	"bytes"
	"compress/zlib"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/mattermost/mattermost-load-test-ng/loadtest/user/websocket"
	"github.com/mattermost/mattermost-server/v6/model"

	"github.com/pion/rtcp"
	"github.com/pion/webrtc/v3"
	"github.com/pion/webrtc/v3/pkg/media"
	"github.com/pion/webrtc/v3/pkg/media/oggreader"
)

var (
	rtpAudioCodec = webrtc.RTPCodecCapability{
		MimeType:     "audio/opus",
		ClockRate:    48000,
		Channels:     2,
		SDPFmtpLine:  "minptime=10;useinbandfec=1",
		RTCPFeedback: nil,
	}
)

type config struct {
	username  string
	password  string
	teamID    string
	channelID string
	siteURL   string
	wsURL     string
	duration  time.Duration
	unmuted   bool
}

func transmitAudio(ws *websocket.Client, track *webrtc.TrackLocalStaticSample, rtpSender *webrtc.RTPSender, connectedCh <-chan struct{}) {
	go func() {
		rtcpBuf := make([]byte, 1500)
		for {
			if _, _, rtcpErr := rtpSender.Read(rtcpBuf); rtcpErr != nil {
				return
			}
		}
	}()

	go func() {
		// Open a OGG file and start reading using our OGGReader
		file, oggErr := os.Open("./lt/samples/audio.ogg")
		if oggErr != nil {
			log.Fatalf(oggErr.Error())
		}
		defer file.Close()

		// Open on oggfile in non-checksum mode.
		ogg, _, oggErr := oggreader.NewWith(file)
		if oggErr != nil {
			log.Fatalf(oggErr.Error())
		}

		// Wait for connection established
		<-connectedCh

		go func() {
			time.Sleep(2 * time.Second)
			if err := ws.SendMessage("custom_com.mattermost.calls_unmute", nil); err != nil {
				log.Fatalf(oggErr.Error())
			}
		}()

		defer func() {
			if err := ws.SendMessage("custom_com.mattermost.calls_mute", nil); err != nil {
				log.Fatalf(oggErr.Error())
			}
		}()

		// Keep track of last granule, the difference is the amount of samples in the buffer
		var lastGranule uint64

		// It is important to use a time.Ticker instead of time.Sleep because
		// * avoids accumulating skew, just calling time.Sleep didn't compensate for the time spent parsing the data
		// * works around latency issues with Sleep (see https://github.com/golang/go/issues/44343)
		oggPageDuration := time.Millisecond * 20
		ticker := time.NewTicker(oggPageDuration)
		for ; true; <-ticker.C {
			pageData, pageHeader, oggErr := ogg.ParseNextPage()
			if oggErr == io.EOF {
				ogg.ResetReader(func(_ int64) io.Reader {
					_, _ = file.Seek(0, 0)
					return file
				})
				continue
			}

			if oggErr != nil {
				log.Fatalf(oggErr.Error())
			}

			// The amount of samples is the difference between the last and current timestamp
			sampleCount := float64(pageHeader.GranulePosition - lastGranule)
			lastGranule = pageHeader.GranulePosition
			sampleDuration := time.Duration((sampleCount/48000)*1000) * time.Millisecond

			if err := track.WriteSample(media.Sample{Data: pageData, Duration: sampleDuration}); oggErr != nil {
				log.Printf("failed to write audio sample: %s", err.Error())
			}
		}
	}()
}

func initRTC(ws *websocket.Client, channelID string, unmuted bool) (*webrtc.PeerConnection, error) {
	log.Printf("setting up RTC connection")

	peerConnConfig := webrtc.Configuration{
		ICEServers: []webrtc.ICEServer{
			{
				URLs: []string{
					"stun:calls.test.mattermost.com:3478",
				},
			},
		},
		SDPSemantics: webrtc.SDPSemanticsUnifiedPlanWithFallback,
	}

	pc, err := webrtc.NewPeerConnection(peerConnConfig)
	if err != nil {
		return nil, err
	}

	pc.OnICECandidate(func(c *webrtc.ICECandidate) {
		log.Printf("ice: %v", c)
	})

	connectedCh := make(chan struct{})
	pc.OnICEConnectionStateChange(func(connectionState webrtc.ICEConnectionState) {
		if connectionState == webrtc.ICEConnectionStateConnected {
			close(connectedCh)
		}
	})

	pc.OnTrack(func(track *webrtc.TrackRemote, receiver *webrtc.RTPReceiver) {
		rtcpSendErr := pc.WriteRTCP([]rtcp.Packet{&rtcp.PictureLossIndication{MediaSSRC: uint32(track.SSRC())}})
		if rtcpSendErr != nil {
			log.Printf(rtcpSendErr.Error())
		}

		codecName := strings.Split(track.Codec().RTPCodecCapability.MimeType, "/")[1]
		log.Printf("Track has started, of type %d: %s \n", track.PayloadType(), codecName)

		buf := make([]byte, 1400)
		for {
			_, _, readErr := track.Read(buf)
			if readErr != nil {
				log.Printf("%v", readErr.Error())
				return
			}
		}
	})

	track, err := webrtc.NewTrackLocalStaticSample(rtpAudioCodec, "audio", "pion")
	if err != nil {
		return nil, err
	}

	rtpSender, err := pc.AddTrack(track)
	if err != nil {
		return nil, err
	}

	if unmuted {
		transmitAudio(ws, track, rtpSender, connectedCh)
	}

	sdp, err := pc.CreateOffer(nil)
	if err != nil {
		return nil, err
	}

	if err := pc.SetLocalDescription(sdp); err != nil {
		return nil, err
	}

	var sdpData bytes.Buffer
	w := zlib.NewWriter(&sdpData)
	if err := json.NewEncoder(w).Encode(sdp); err != nil {
		return nil, err
	}
	w.Close()

	data := map[string]interface{}{
		"data": sdpData.Bytes(),
	}
	if err := ws.SendBinaryMessage("custom_com.mattermost.calls_sdp", data); err != nil {
		return nil, err
	}

	return pc, nil
}

func handleSignal(ws *websocket.Client, pc *webrtc.PeerConnection, ev *model.WebSocketEvent, iceCh chan webrtc.ICECandidateInit) {
	evData := ev.GetData()
	var data map[string]interface{}
	if err := json.Unmarshal([]byte(evData["data"].(string)), &data); err != nil {
		log.Fatalf(err.Error())
	}

	t, _ := data["type"].(string)

	if t == "candidate" {
		log.Printf("ice!")
		iceCh <- webrtc.ICECandidateInit{Candidate: data["candidate"].(map[string]interface{})["candidate"].(string)}
	} else if t == "answer" {
		log.Printf("sdp answer!")
		if err := pc.SetRemoteDescription(webrtc.SessionDescription{
			Type: webrtc.SDPTypeAnswer,
			SDP:  data["sdp"].(string),
		}); err != nil {
			log.Printf(err.Error())
		}

		go func() {
			for ice := range iceCh {
				if err := pc.AddICECandidate(ice); err != nil {
					log.Printf(err.Error())
				}
			}
		}()

	} else if t == "offer" {
		log.Printf("sdp offer!")
		if err := pc.SetRemoteDescription(webrtc.SessionDescription{
			Type: webrtc.SDPTypeOffer,
			SDP:  data["sdp"].(string),
		}); err != nil {
			log.Printf(err.Error())
		}

		sdp, err := pc.CreateAnswer(nil)
		if err != nil {
			log.Printf(err.Error())
		}

		if err := pc.SetLocalDescription(sdp); err != nil {
			log.Printf(err.Error())
		}

		var sdpData bytes.Buffer
		w := zlib.NewWriter(&sdpData)
		if err := json.NewEncoder(w).Encode(sdp); err != nil {
			log.Fatalf(err.Error())
		}
		w.Close()

		data := map[string]interface{}{
			"data": sdpData.Bytes(),
		}
		if err := ws.SendBinaryMessage("custom_com.mattermost.calls_sdp", data); err != nil {
			log.Fatalf(err.Error())
		}
	}
}

func eventHandler(ws *websocket.Client, channelID string, unmuted bool, doneCh chan struct{}) {
	var err error
	var pc *webrtc.PeerConnection
	iceCh := make(chan webrtc.ICECandidateInit, 10)
	defer close(iceCh)

	for {
		select {
		case ev, ok := <-ws.EventChannel:
			if !ok {
				return
			}
			switch ev.EventType() {
			case "hello":
				log.Printf("joining call")
				data := map[string]interface{}{
					"channelID": channelID,
				}
				if err := ws.SendMessage("custom_com.mattermost.calls_join", data); err != nil {
					log.Fatalf(err.Error())
				}
			case "custom_com.mattermost.calls_join":
				log.Printf("joined call")
				pc, err = initRTC(ws, channelID, unmuted)
				if err != nil {
					log.Fatalf(err.Error())
				}
				defer pc.Close()
			case "custom_com.mattermost.calls_signal":
				handleSignal(ws, pc, ev, iceCh)
			default:
			}
		case <-doneCh:
			return
		}
	}
}

func connectUser(c config) error {
	log.Printf("%s: connecting user", c.username)

	var user *model.User
	client := model.NewAPIv4Client(c.siteURL)
	// login (or create) user
	user, _, err := client.Login(c.username, c.password)
	appErr, ok := err.(*model.AppError)
	if err != nil && !ok {
		return err
	}

	if ok && appErr != nil && appErr.Id != "api.user.login.invalid_credentials_email_username" {
		return err
	} else if ok && appErr != nil && appErr.Id == "api.user.login.invalid_credentials_email_username" {
		log.Printf("%s: registering user", c.username)
		user, _, err = client.CreateUser(&model.User{
			Username: c.username,
			Password: c.password,
			Email:    c.username + "@example.com",
		})
		if err != nil {
			return err
		}
		_, _, err = client.Login(c.username, c.password)
		if err != nil {
			return err
		}
	}

	log.Printf("%s: logged in", c.username)

	// join team
	_, _, err = client.AddTeamMember(c.teamID, user.Id)
	if err != nil {
		return err
	}

	// join channel
	_, _, err = client.AddChannelMember(c.channelID, user.Id)
	if err != nil {
		return err
	}

	log.Printf("%s: connecting to websocket", c.username)

	ws, err := websocket.NewClient4(&websocket.ClientParams{
		WsURL:     c.wsURL,
		AuthToken: client.AuthToken,
	})
	if err != nil {
		return err
	}

	doneCh := make(chan struct{})

	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		eventHandler(ws, c.channelID, c.unmuted, doneCh)
	}()

	ticker := time.NewTicker(c.duration)
	defer ticker.Stop()
	<-ticker.C

	log.Printf("%s: disconnecting...", c.username)
	close(doneCh)
	wg.Wait()
	ws.Close()

	log.Printf("%s: disconnected", c.username)

	return nil
}

func main() {
	var teamID string
	var channelID string
	var siteURL string
	var password string
	var userPrefix string
	var duration string
	var joinDuration string
	var numUsers int
	var offset int
	var numUnmuted int
	flag.StringVar(&teamID, "team", "", "team ID")
	flag.StringVar(&channelID, "channel", "", "channel ID")
	flag.StringVar(&siteURL, "url", "http://localhost:8065", "MM SiteURL")
	flag.StringVar(&userPrefix, "user-prefix", "testuser-", "user prefix")
	flag.StringVar(&password, "password", "testPass123$", "user password")
	flag.IntVar(&numUsers, "users", 1, "number of users to connect")
	flag.IntVar(&numUnmuted, "unmuted", 0, "number of unmuted users")
	flag.IntVar(&offset, "offset", 0, "users offset")
	flag.StringVar(&duration, "duration", "1m", "duration")
	flag.StringVar(&joinDuration, "join-duration", "30s", "join duration")
	flag.Parse()

	if teamID == "" {
		log.Fatalf("team must be set")
	}

	if channelID == "" {
		log.Fatalf("channel must be set")
	}

	if siteURL == "" {
		log.Fatalf("siteURL must be set")
	}

	dur, err := time.ParseDuration(duration)
	if err != nil {
		log.Fatalf(err.Error())
	}

	joinDur, err := time.ParseDuration(joinDuration)
	if err != nil {
		log.Fatalf(err.Error())
	}

	var wsURL string
	u, err := url.Parse(siteURL)
	if err != nil {
		log.Fatalf(err.Error())
	}
	if u.Scheme == "https" {
		wsURL = "wss://" + u.Host
	} else {
		wsURL = "ws://" + u.Host
	}

	if numUnmuted > numUsers {
		log.Fatalf("unmuted cannot be greater than the number of users")
	}

	var wg sync.WaitGroup
	wg.Add(numUsers)
	for i := offset; i < numUsers+offset; i++ {
		go func(i int) {
			defer wg.Done()
			time.Sleep(time.Duration(rand.Intn(int(joinDur.Seconds()))) * time.Second)
			username := fmt.Sprintf("%s%d", userPrefix, i)
			cfg := config{
				username:  username,
				password:  password,
				teamID:    teamID,
				channelID: channelID,
				siteURL:   siteURL,
				wsURL:     wsURL,
				duration:  dur,
				unmuted:   (i - offset) < numUnmuted,
			}
			if err := connectUser(cfg); err != nil {
				log.Printf("connectUser failed: %s", err.Error())
			}
		}(i)
	}

	wg.Wait()

	fmt.Println("DONE")
}
