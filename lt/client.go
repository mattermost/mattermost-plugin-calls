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
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/lt/ws"

	"github.com/mattermost/mattermost-server/v6/model"

	"github.com/pion/interceptor"
	"github.com/pion/rtcp"
	"github.com/pion/rtp"
	"github.com/pion/rtp/codecs"
	"github.com/pion/webrtc/v3"
	"github.com/pion/webrtc/v3/pkg/media"
	"github.com/pion/webrtc/v3/pkg/media/ivfreader"
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
	rtpVideoCodecVP8 = webrtc.RTPCodecCapability{
		MimeType:    "video/VP8",
		ClockRate:   90000,
		Channels:    0,
		SDPFmtpLine: "",
		RTCPFeedback: []webrtc.RTCPFeedback{
			{Type: "goog-remb", Parameter: ""},
			{Type: "ccm", Parameter: "fir"},
			{Type: "nack", Parameter: ""},
			{Type: "nack", Parameter: "pli"},
		},
	}
	rtpVideoExtensions = []string{
		"urn:ietf:params:rtp-hdrext:sdes:mid",
		"urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id",
		"urn:ietf:params:rtp-hdrext:sdes:repaired-rtp-stream-id",
	}
	audioLevelExtensionURI = "urn:ietf:params:rtp-hdrext:ssrc-audio-level"
)

const (
	simulcastLevelHigh = "h"
	simulcastLevelLow  = "l"
	receiveMTU         = 1460
	sendMTU            = 1200
)

type config struct {
	username      string
	password      string
	teamID        string
	channelID     string
	siteURL       string
	wsURL         string
	duration      time.Duration
	unmuted       bool
	screenSharing bool
	recording     bool
	simulcast     bool
}

type user struct {
	userID      string
	cfg         config
	client      *model.Client4
	pc          *webrtc.PeerConnection
	dc          *webrtc.DataChannel
	connectedCh chan struct{}
	doneCh      chan struct{}
	iceCh       chan webrtc.ICECandidateInit
	initCh      chan struct{}
	isHost      bool

	// WebSocket
	wsCloseCh chan struct{}
	wsSendCh  chan wsMsg
}

type wsMsg struct {
	event  string
	data   map[string]interface{}
	binary bool
}

func newUser(cfg config) *user {
	return &user{
		cfg:         cfg,
		connectedCh: make(chan struct{}),
		doneCh:      make(chan struct{}),
		iceCh:       make(chan webrtc.ICECandidateInit, 10),
		wsCloseCh:   make(chan struct{}),
		wsSendCh:    make(chan wsMsg, 256),
		initCh:      make(chan struct{}),
	}
}

func (u *user) sendVideoFile(track *webrtc.TrackLocalStaticRTP, trx *webrtc.RTPTransceiver, simulcast bool) {
	getExtensionID := func(URI string) uint8 {
		for _, ext := range trx.Sender().GetParameters().RTPParameters.HeaderExtensions {
			if ext.URI == URI {
				return uint8(ext.ID)
			}
		}
		return 0
	}

	packetizer := rtp.NewPacketizer(
		sendMTU,
		0,
		0,
		&codecs.VP8Payloader{
			EnablePictureID: true,
		},
		rtp.NewRandomSequencer(),
		rtpVideoCodecVP8.ClockRate,
	)

	// Open a IVF file and start reading using our IVFReader
	file, ivfErr := os.Open(fmt.Sprintf("./lt/samples/video_%s.ivf", track.RID()))
	if ivfErr != nil {
		log.Fatalf(ivfErr.Error())
	}
	defer file.Close()

	ivf, header, ivfErr := ivfreader.NewWith(file)
	if ivfErr != nil {
		log.Fatalf(ivfErr.Error())
	}

	// Wait for connection established
	<-u.connectedCh

	// Send our video file frame at a time. Pace our sending so we send it at the same speed it should be played back as.
	// This isn't required since the video is timestamped, but we will such much higher loss if we send all at once.
	//
	// It is important to use a time.Ticker instead of time.Sleep because
	// * avoids accumulating skew, just calling time.Sleep didn't compensate for the time spent parsing the data
	// * works around latency issues with Sleep (see https://github.com/golang/go/issues/44343)
	frameDuration := time.Millisecond * time.Duration((float32(header.TimebaseNumerator)/float32(header.TimebaseDenominator))*1000)

	ticker := time.NewTicker(frameDuration)
	for ; true; <-ticker.C {
		var frame []byte
		var ivfErr error
		frame, _, ivfErr = ivf.ParseNextFrame()
		if ivfErr == io.EOF || (ivfErr != nil && ivfErr.Error() == "incomplete frame data") {
			ivf.ResetReader(func(_ int64) io.Reader {
				_, _ = file.Seek(0, 0)
				ivf, header, ivfErr = ivfreader.NewWith(file)
				if ivfErr != nil {
					log.Fatalf(ivfErr.Error())
				}
				return file
			})
			frame, _, ivfErr = ivf.ParseNextFrame()
		}
		if ivfErr != nil {
			log.Fatalf(ivfErr.Error())
		}

		packets := packetizer.Packetize(frame, rtpVideoCodecVP8.ClockRate/header.TimebaseDenominator)
		for _, p := range packets {
			if simulcast {
				if err := p.Header.SetExtension(getExtensionID(rtpVideoExtensions[0]), []byte(trx.Mid())); err != nil {
					log.Printf("failed to set header extension: %s", err.Error())
				}

				if err := p.Header.SetExtension(getExtensionID(rtpVideoExtensions[1]), []byte(track.RID())); err != nil {
					log.Printf("failed to set header extension: %s", err.Error())
				}
			}

			if err := track.WriteRTP(p); err != nil {
				log.Printf("failed to write video sample: %s", err.Error())
				return
			}
		}
	}
}

func (u *user) startRecording() error {
	log.Printf("%s: starting recording", u.cfg.username)
	res, err := u.client.DoAPIRequest(http.MethodPost,
		fmt.Sprintf("%s/plugins/com.mattermost.calls/calls/%s/recording/start", u.client.URL, u.cfg.channelID), "", "")
	defer res.Body.Close()

	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}

	if res.StatusCode == 200 {
		return nil
	}

	return fmt.Errorf("unexpected status code %d", res.StatusCode)
}

func (u *user) transmitScreen(simulcast bool) {
	streamID := model.NewId()

	trackHigh, err := webrtc.NewTrackLocalStaticRTP(rtpVideoCodecVP8, "video", streamID, webrtc.WithRTPStreamID(simulcastLevelHigh))
	if err != nil {
		log.Fatalf(err.Error())
	}

	trx, err := u.pc.AddTransceiverFromTrack(trackHigh, webrtc.RTPTransceiverInit{Direction: webrtc.RTPTransceiverDirectionSendonly})
	if err != nil {
		log.Fatalf(err.Error())
	}

	info := map[string]string{
		"screenStreamID": trackHigh.StreamID(),
	}
	data, err := json.Marshal(&info)
	if err != nil {
		log.Fatalf(err.Error())
	}

	select {
	case u.wsSendCh <- wsMsg{event: "custom_com.mattermost.calls_screen_on", data: map[string]interface{}{
		"data": string(data),
	}}:
	default:
		log.Printf("failed to send ws message")
	}

	rtpSender := trx.Sender()

	var trackLow *webrtc.TrackLocalStaticRTP
	if simulcast {
		trackLow, err = webrtc.NewTrackLocalStaticRTP(rtpVideoCodecVP8, "video", streamID, webrtc.WithRTPStreamID(simulcastLevelLow))
		if err != nil {
			log.Fatalf(err.Error())
		}
		if err := rtpSender.AddEncoding(trackLow); err != nil {
			log.Fatalf(err.Error())
		}
	}

	go func() {
		rtcpBuf := make([]byte, receiveMTU)
		for {
			if _, _, rtcpErr := rtpSender.Read(rtcpBuf); rtcpErr != nil {
				return
			}
		}
	}()

	go func() {
		defer func() {
			select {
			case u.wsSendCh <- wsMsg{event: "custom_com.mattermost.calls_screen_off", data: nil}:
			default:
				log.Printf("failed to send ws message")
			}
		}()

		if simulcast {
			go u.sendVideoFile(trackLow, trx, simulcast)
		}

		u.sendVideoFile(trackHigh, trx, simulcast)
	}()
}

func (u *user) transmitAudio() {
	track, err := webrtc.NewTrackLocalStaticSample(rtpAudioCodec, "audio", "voice"+model.NewId())
	if err != nil {
		log.Fatalf(err.Error())
	}
	sender, err := u.pc.AddTrack(track)
	if err != nil {
		log.Fatalf(err.Error())
	}

	go func() {
		rtcpBuf := make([]byte, receiveMTU)
		for {
			if _, _, rtcpErr := sender.Read(rtcpBuf); rtcpErr != nil {
				log.Printf("%s: failed to read rtcp: %s", u.cfg.username, rtcpErr.Error())
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
		<-u.connectedCh

		select {
		case u.wsSendCh <- wsMsg{event: "custom_com.mattermost.calls_unmute", data: nil}:
		default:
			log.Printf("failed to send ws message")
		}
		defer func() {
			select {
			case u.wsSendCh <- wsMsg{event: "custom_com.mattermost.calls_mute", data: nil}:
			default:
				log.Printf("failed to send ws message")
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
			var oggErr error
			var pageData []byte
			var pageHeader *oggreader.OggPageHeader
			pageData, pageHeader, oggErr = ogg.ParseNextPage()
			if oggErr == io.EOF {
				ogg.ResetReader(func(_ int64) io.Reader {
					_, _ = file.Seek(0, 0)
					return file
				})
				pageData, pageHeader, oggErr = ogg.ParseNextPage()
			}
			if oggErr != nil {
				log.Fatalf(oggErr.Error())
			}

			// The amount of samples is the difference between the last and current timestamp
			sampleCount := float64(pageHeader.GranulePosition - lastGranule)
			lastGranule = pageHeader.GranulePosition
			sampleDuration := time.Duration((sampleCount/48000)*1000) * time.Millisecond

			if err := track.WriteSample(media.Sample{Data: pageData, Duration: sampleDuration}); err != nil {
				log.Printf("failed to write audio sample: %s", err.Error())
			}
		}
	}()
}

func (u *user) initRTC() error {
	log.Printf("%s: setting up RTC connection", u.cfg.username)

	peerConnConfig := webrtc.Configuration{
		ICEServers:   []webrtc.ICEServer{},
		SDPSemantics: webrtc.SDPSemanticsUnifiedPlan,
	}

	var m webrtc.MediaEngine
	if err := m.RegisterDefaultCodecs(); err != nil {
		return err
	}

	i := interceptor.Registry{}
	if err := webrtc.RegisterDefaultInterceptors(&m, &i); err != nil {
		return err
	}

	if err := m.RegisterHeaderExtension(webrtc.RTPHeaderExtensionCapability{
		URI: audioLevelExtensionURI,
	}, webrtc.RTPCodecTypeAudio); err != nil {
		return err
	}

	if u.cfg.simulcast {
		for _, ext := range rtpVideoExtensions {
			if err := m.RegisterHeaderExtension(webrtc.RTPHeaderExtensionCapability{URI: ext}, webrtc.RTPCodecTypeVideo); err != nil {
				return err
			}
		}
	}

	api := webrtc.NewAPI(webrtc.WithMediaEngine(&m), webrtc.WithInterceptorRegistry(&i))

	pc, err := api.NewPeerConnection(peerConnConfig)
	if err != nil {
		return err
	}
	u.pc = pc

	gatherCh := make(chan struct{}, 1)
	pc.OnICECandidate(func(c *webrtc.ICECandidate) {
		if c == nil {
			log.Printf("%s: end of candidates", u.cfg.username)
			select {
			case gatherCh <- struct{}{}:
			default:
			}
			return
		}

		log.Printf("%s: ice: %v", u.cfg.username, c)

		data, err := json.Marshal(c.ToJSON())
		if err != nil {
			log.Fatalf(err.Error())
		}

		select {
		case u.wsSendCh <- wsMsg{"custom_com.mattermost.calls_ice", map[string]interface{}{
			"data": string(data),
		}, false}:
		default:
			log.Fatalf("failed to send ice ws message")
		}
	})

	pc.OnICEConnectionStateChange(func(connectionState webrtc.ICEConnectionState) {
		if connectionState == webrtc.ICEConnectionStateConnected {
			log.Printf("%s: rtc connected", u.cfg.username)
			close(u.connectedCh)

			if u.cfg.recording && u.isHost {
				if err := u.startRecording(); err != nil {
					log.Printf("%s: failed to start recording: %s", u.cfg.username, err)
				} else {
					log.Printf("%s: recording started successfully", u.cfg.username)
				}
			}
		}

		if connectionState == webrtc.ICEConnectionStateDisconnected || connectionState == webrtc.ICEConnectionStateFailed {
			log.Printf("%s: ice disconnect", u.cfg.username)
			close(u.wsCloseCh)
		}
	})

	pc.OnTrack(func(track *webrtc.TrackRemote, receiver *webrtc.RTPReceiver) {
		if track.Kind() == webrtc.RTPCodecTypeVideo {
			rtcpSendErr := pc.WriteRTCP([]rtcp.Packet{&rtcp.PictureLossIndication{MediaSSRC: uint32(track.SSRC())}})
			if rtcpSendErr != nil {
				log.Printf("%s: rtcp send error: %s", u.cfg.username, rtcpSendErr.Error())
			}
		}

		codecName := strings.Split(track.Codec().RTPCodecCapability.MimeType, "/")[1]
		log.Printf("%s: Track has started, of type %d: %s \n", u.cfg.username, track.PayloadType(), codecName)

		buf := make([]byte, receiveMTU)
		for {
			_, _, readErr := track.Read(buf)
			if readErr != nil {
				log.Printf("%s: track read error: %s", u.cfg.username, readErr.Error())
				return
			}
		}
	})

	if u.cfg.unmuted {
		u.transmitAudio()
	}

	if u.cfg.screenSharing {
		u.transmitScreen(u.cfg.simulcast)
	}

	dc, err := pc.CreateDataChannel("calls-dc", nil)
	if err != nil {
		return err
	}

	u.dc = dc

	offer, err := pc.CreateOffer(nil)
	if err != nil {
		return err
	}

	if err := pc.SetLocalDescription(offer); err != nil {
		return err
	}

	var sdpData bytes.Buffer
	w := zlib.NewWriter(&sdpData)
	if err := json.NewEncoder(w).Encode(offer); err != nil {
		return err
	}
	w.Close()

	data := map[string]interface{}{
		"data": sdpData.Bytes(),
	}

	select {
	case u.wsSendCh <- wsMsg{"custom_com.mattermost.calls_sdp", data, true}:
	default:
		log.Fatalf("failed to send sdp ws message")
	}

	<-gatherCh

	close(u.initCh)

	return nil
}

func (u *user) handleSignal(ev *model.WebSocketEvent) {
	evData := ev.GetData()
	var data map[string]interface{}
	if err := json.Unmarshal([]byte(evData["data"].(string)), &data); err != nil {
		log.Fatalf(err.Error())
	}

	t, _ := data["type"].(string)

	if t == "candidate" {
		log.Printf("%s: ice!", u.cfg.username)
		u.iceCh <- webrtc.ICECandidateInit{Candidate: data["candidate"].(map[string]interface{})["candidate"].(string)}
	} else if t == "answer" {
		log.Printf("%s: sdp answer!", u.cfg.username)
		if err := u.pc.SetRemoteDescription(webrtc.SessionDescription{
			Type: webrtc.SDPTypeAnswer,
			SDP:  data["sdp"].(string),
		}); err != nil {
			log.Fatalf("%s: SetRemoteDescription failed: %s", u.cfg.username, err.Error())
		}

		go func() {
			for ice := range u.iceCh {
				if err := u.pc.AddICECandidate(ice); err != nil {
					log.Printf("%s: %s", u.cfg.username, err.Error())
				}
			}
		}()

	} else if t == "offer" {
		log.Printf("%s: sdp offer", u.cfg.username)

		if u.pc.SignalingState() != webrtc.SignalingStateStable {
			log.Printf("%s: signaling conflict on offer, queuing", u.cfg.username)
			go func() {
				time.Sleep(100 * time.Millisecond)
				log.Printf("%s: applying previously queued offer", u.cfg.username)
				u.handleSignal(ev)
			}()
			return
		}

		if err := u.pc.SetRemoteDescription(webrtc.SessionDescription{
			Type: webrtc.SDPTypeOffer,
			SDP:  data["sdp"].(string),
		}); err != nil {
			log.Fatalf("%s: SetRemoteDescription failed: %s", u.cfg.username, err.Error())
		}

		sdp, err := u.pc.CreateAnswer(nil)
		if err != nil {
			log.Printf("%s: %s", u.cfg.username, err.Error())
		}

		if err := u.pc.SetLocalDescription(sdp); err != nil {
			log.Printf("%s: SetLocalDescription failed: %s", u.cfg.username, err.Error())
		}

		var sdpData bytes.Buffer
		w := zlib.NewWriter(&sdpData)
		if err := json.NewEncoder(w).Encode(sdp); err != nil {
			log.Fatalf("%s: %s", u.cfg.username, err.Error())
		}
		w.Close()

		data := map[string]interface{}{
			"data": sdpData.Bytes(),
		}
		select {
		case u.wsSendCh <- wsMsg{"custom_com.mattermost.calls_sdp", data, true}:
		default:
			log.Printf("failed to send ws message")
		}
	}
}

func (u *user) wsListen(authToken string) {
	defer close(u.iceCh)

	var wsConnID string
	var originalConnID string
	var wsServerSeq int64

	connect := func() (*ws.Client, error) {
		ws, err := ws.NewClient(&ws.ClientParams{
			WsURL:          u.cfg.wsURL,
			AuthToken:      authToken,
			ConnID:         wsConnID,
			ServerSequence: wsServerSeq,
		})
		return ws, err
	}

	ws, err := connect()
	if err != nil {
		log.Fatalf(err.Error())
		return
	}

	defer func() {
		err := ws.SendMessage("custom_com.mattermost.calls_leave", nil)
		if err != nil {
			log.Printf("%s: ws send error: %s", u.cfg.username, err.Error())
		}
		ws.Close()
	}()

	for {
		select {
		case ev, ok := <-ws.EventChannel:
			if !ok {
				log.Printf("ws disconnected")
				for {
					time.Sleep(time.Second)
					log.Printf("attempting ws reconnection")
					ws, err = connect()
					if err != nil {
						log.Printf(err.Error())
						continue
					}

					data := map[string]interface{}{
						"channelID":      u.cfg.channelID,
						"originalConnID": originalConnID,
						"prevConnID":     wsConnID,
					}
					if err := ws.SendMessage("custom_com.mattermost.calls_reconnect", data); err != nil {
						log.Printf("%s: ws send error: %s", u.cfg.username, err.Error())
						continue
					}

					break
				}
				continue
			}
			if ev.EventType() == "hello" {
				if connID, ok := ev.GetData()["connection_id"].(string); ok {
					if wsConnID != connID {
						log.Printf("new connection id from server")
						wsServerSeq = 0
					}
					wsConnID = connID
					if originalConnID == "" {
						log.Printf("setting original conn id")
						originalConnID = connID

						log.Printf("%s: joining call", u.cfg.username)
						data := map[string]interface{}{
							"channelID": u.cfg.channelID,
						}
						if err := ws.SendMessage("custom_com.mattermost.calls_join", data); err != nil {
							log.Fatalf(err.Error())
						}
					}
				}
			}

			if ev.GetSequence() != wsServerSeq {
				log.Printf("missed websocket event")
				return
			}

			wsServerSeq = ev.GetSequence() + 1

			if ev.EventType() == "custom_com.mattermost.calls_call_start" {
				channelID, _ := ev.GetData()["channelID"].(string)
				hostID, _ := ev.GetData()["host_id"].(string)
				if channelID == u.cfg.channelID && hostID == u.userID {
					log.Printf("%s: I am call host", u.cfg.username)
					u.isHost = true
				}
				continue
			}

			if connID, ok := ev.GetData()["connID"].(string); !ok || (connID != wsConnID && connID != originalConnID) {
				continue
			}

			switch ev.EventType() {
			case "custom_com.mattermost.calls_join":
				log.Printf("%s: joined call", u.cfg.username)
				if err := u.initRTC(); err != nil {
					log.Fatalf(err.Error())
				}
				defer u.pc.Close()
			case "custom_com.mattermost.calls_signal":
				log.Printf("%s: received signal", u.cfg.username)
				select {
				case <-u.initCh:
					u.handleSignal(ev)
				case <-time.After(2 * time.Second):
					log.Printf("%s: timed out waiting for init", u.cfg.username)
				}
			case "custom_com.mattermost.calls_call_end":
				log.Printf("%s: call end event, exiting", u.cfg.username)
				return
			default:
			}
		case msg, ok := <-u.wsSendCh:
			if !ok {
				return
			}
			if msg.binary {
				if err := ws.SendBinaryMessage(msg.event, msg.data); err != nil {
					log.Fatalf(err.Error())
				}
			} else {
				if err := ws.SendMessage(msg.event, msg.data); err != nil {
					log.Fatalf(err.Error())
				}
			}
		case <-u.wsCloseCh:
			return
		case <-u.doneCh:
			return
		}
	}
}

func (u *user) Connect(stopCh chan struct{}, channelType model.ChannelType) error {
	log.Printf("%s: connecting user", u.cfg.username)

	var user *model.User
	client := model.NewAPIv4Client(u.cfg.siteURL)
	u.client = client
	// login (or create) user
	user, _, err := client.Login(u.cfg.username, u.cfg.password)
	appErr, ok := err.(*model.AppError)
	if err != nil && !ok {
		return err
	}

	if ok && appErr != nil && appErr.Id != "api.user.login.invalid_credentials_email_username" {
		return err
	} else if ok && appErr != nil && appErr.Id == "api.user.login.invalid_credentials_email_username" {
		log.Printf("%s: registering user", u.cfg.username)
		user, _, err = client.CreateUser(&model.User{
			Username: u.cfg.username,
			Password: u.cfg.password,
			Email:    u.cfg.username + "@example.com",
		})
		if err != nil {
			return err
		}
		user, _, err = client.Login(u.cfg.username, u.cfg.password)
		if err != nil {
			return err
		}
	}

	log.Printf("%s: logged in", u.cfg.username)
	u.userID = user.Id

	// join team
	_, _, err = client.AddTeamMember(u.cfg.teamID, user.Id)
	if err != nil {
		return err
	}

	if channelType == "O" || channelType == "P" {
		// join channel
		_, _, err = client.AddChannelMember(u.cfg.channelID, user.Id)
		if err != nil {
			return err
		}
	}

	log.Printf("%s: connecting to websocket", u.cfg.username)

	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		u.wsListen(client.AuthToken)
	}()

	ticker := time.NewTicker(u.cfg.duration)
	defer ticker.Stop()

	select {
	case <-ticker.C:
	case <-stopCh:
	}

	log.Printf("%s: disconnecting...", u.cfg.username)
	close(u.doneCh)
	wg.Wait()

	log.Printf("%s: disconnected", u.cfg.username)

	return nil
}

func main() {
	// TODO: consider using a config file instead.
	var teamID string
	var channelID string
	var siteURL string
	var userPassword string
	var userPrefix string
	var duration string
	var joinDuration string
	var adminUsername string
	var adminPassword string
	var offset int
	var numUnmuted int
	var numScreenSharing int
	var numCalls int
	var numUsersPerCall int
	var numRecordings int
	var simulcast bool

	flag.StringVar(&teamID, "team", "", "The team ID to start calls in")
	flag.StringVar(&channelID, "channel", "", "The channel ID to start the call in")
	flag.StringVar(&siteURL, "url", "http://localhost:8065", "Mattermost SiteURL")
	flag.StringVar(&userPrefix, "user-prefix", "testuser-", "The user prefix used to create and log in users")
	flag.StringVar(&userPassword, "user-password", "testPass123$", "user password")
	flag.IntVar(&numUnmuted, "unmuted", 0, "The number of unmuted users per call")
	flag.IntVar(&numScreenSharing, "screen-sharing", 0, "The number of users screen-sharing")
	flag.IntVar(&numRecordings, "recordings", 0, "The number of calls to record")
	flag.IntVar(&offset, "offset", 0, "The user offset")
	flag.IntVar(&numCalls, "calls", 1, "The number of calls to start")
	flag.IntVar(&numUsersPerCall, "users-per-call", 1, "The number of participants per call")
	flag.StringVar(&duration, "duration", "1m", "The total duration of the test")
	flag.StringVar(&joinDuration, "join-duration", "30s", "The amount of time it takes for all participants to join their calls")
	flag.StringVar(&adminUsername, "admin-username", "sysadmin", "The username of a system admin account")
	flag.StringVar(&adminPassword, "admin-password", "Sys@dmin-sample1", "The password of a system admin account")
	flag.BoolVar(&simulcast, "simulcast", true, "Whether or not to enable simulcast for screen")

	flag.Parse()

	if numCalls == 0 {
		log.Fatalf("calls should be > 0")
	}

	if channelID != "" && numCalls != 1 {
		log.Fatalf("number of calls should be 1 when running on a single channel")
	}

	if channelID == "" && teamID == "" {
		log.Fatalf("team must be set")
	}

	if numUsersPerCall == 0 {
		log.Fatalf("users-per-call should be > 0")
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

	if numUnmuted > numUsersPerCall {
		log.Fatalf("unmuted cannot be greater than the number of users per call")
	}

	if numScreenSharing > numCalls {
		log.Fatalf("screen-sharing cannot be greater than the number of calls")
	}

	if numRecordings > numCalls {
		log.Fatalf("recordings cannot be greater than the number of calls")
	}

	adminClient := model.NewAPIv4Client(siteURL)
	_, _, err = adminClient.Login(adminUsername, adminPassword)
	if err != nil {
		log.Fatalf("failed to login as admin: %s", err.Error())
	}

	var channels []*model.Channel
	if channelID == "" {
		page := 0
		perPage := 100
		for {
			chs, _, err := adminClient.SearchChannels(teamID, &model.ChannelSearch{
				Public:  true,
				PerPage: &perPage,
				Page:    &page,
			})
			if err != nil {
				log.Fatalf("failed to search channels: %s", err.Error())
			}
			channels = append(channels, chs...)
			if len(channels) >= numCalls || len(chs) < perPage {
				break
			}
			page++
		}

		if len(channels) < numCalls {
			channels = make([]*model.Channel, numCalls)
			for i := 0; i < numCalls; i++ {
				name := model.NewId()
				channel, _, err := adminClient.CreateChannel(&model.Channel{
					TeamId:      teamID,
					Name:        name,
					DisplayName: "test-" + name,
					Type:        model.ChannelTypeOpen,
				})
				if err != nil {
					log.Fatalf("failed to create channel: %s", err.Error())
				}
				channels[i] = channel
			}
		}
	} else {
		channel, _, err := adminClient.GetChannel(channelID, "")
		if err != nil {
			log.Fatalf("failed to search channels: %s", err.Error())
		}
		channels = append(channels, channel)
	}

	stopCh := make(chan struct{})
	var wg sync.WaitGroup
	wg.Add(numUsersPerCall * numCalls)
	for j := 0; j < numCalls; j++ {
		log.Printf("starting call in %s", channels[j].DisplayName)
		for i := 0; i < numUsersPerCall; i++ {
			go func(idx int, channelID string, teamID string, channelType model.ChannelType, unmuted, screenSharing, recording bool) {
				username := fmt.Sprintf("%s%d", userPrefix, idx)
				if unmuted {
					log.Printf("%s: going to transmit voice", username)
				}
				if screenSharing {
					log.Printf("%s: going to transmit screen", username)
				}
				defer wg.Done()

				ticker := time.NewTicker(time.Duration(rand.Intn(int(joinDur.Milliseconds())))*time.Millisecond + 1)
				defer ticker.Stop()
				select {
				case <-ticker.C:
				case <-stopCh:
					return
				}

				cfg := config{
					username:      username,
					password:      userPassword,
					teamID:        teamID,
					channelID:     channelID,
					siteURL:       siteURL,
					wsURL:         wsURL,
					duration:      dur,
					unmuted:       unmuted,
					screenSharing: screenSharing,
					recording:     recording,
					simulcast:     simulcast,
				}

				user := newUser(cfg)
				if err := user.Connect(stopCh, channelType); err != nil {
					log.Printf("connectUser failed: %s", err.Error())
				}
			}((numUsersPerCall*j)+i+offset, channels[j].Id, channels[j].TeamId, channels[j].Type, i < numUnmuted, i == 0 && j < numScreenSharing, j < numRecordings)
		}
	}

	go func() {
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, os.Interrupt, syscall.SIGINT, syscall.SIGTERM)
		<-sig
		close(stopCh)
	}()

	wg.Wait()

	fmt.Println("DONE")
}
