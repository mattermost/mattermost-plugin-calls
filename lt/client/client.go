package client

import (
	"bytes"
	"compress/zlib"
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/aws/aws-sdk-go/service/polly"
	"github.com/pion/webrtc/v3"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/mattermost/mattermost-plugin-calls/lt/ws"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/pion/interceptor"
	"github.com/pion/rtcp"
	"github.com/pion/rtp"
	"github.com/pion/rtp/codecs"
	"github.com/pion/webrtc/v3/pkg/media"
	"github.com/pion/webrtc/v3/pkg/media/ivfreader"
	"github.com/pion/webrtc/v3/pkg/media/oggreader"

	"gopkg.in/hraban/opus.v2"
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
	HTTPRequestTimeout = 10 * time.Second
)

type Config struct {
	Username      string
	Password      string
	TeamID        string
	ChannelID     string
	SiteURL       string
	WsURL         string
	Duration      time.Duration
	Unmuted       bool
	Speak         bool
	ScreenSharing bool
	Recording     bool
	Simulcast     bool
	Setup         bool
	SpeechFile    string
	PollySession  *polly.Polly
	PollyVoiceID  *string
}

type User struct {
	userID      string
	cfg         Config
	client      *model.Client4
	pc          *webrtc.PeerConnection
	dc          *webrtc.DataChannel
	connectedCh chan struct{}
	doneCh      chan struct{}
	iceCh       chan webrtc.ICECandidateInit
	initCh      chan struct{}
	isHost      bool

	pollySession   *polly.Polly
	pollyVoiceID   *string
	speechTextCh   chan string
	doneSpeakingCh chan struct{}

	// WebSocket
	wsCloseCh chan struct{}
	wsSendCh  chan wsMsg
}

type wsMsg struct {
	event  string
	data   map[string]interface{}
	binary bool
}

func NewUser(cfg Config) *User {
	return &User{
		cfg:            cfg,
		connectedCh:    make(chan struct{}),
		doneCh:         make(chan struct{}),
		iceCh:          make(chan webrtc.ICECandidateInit, 10),
		wsCloseCh:      make(chan struct{}),
		wsSendCh:       make(chan wsMsg, 256),
		initCh:         make(chan struct{}),
		speechTextCh:   make(chan string, 8),
		doneSpeakingCh: make(chan struct{}),
		pollySession:   cfg.PollySession,
		pollyVoiceID:   cfg.PollyVoiceID,
	}
}

func (u *User) sendVideoFile(track *webrtc.TrackLocalStaticRTP, trx *webrtc.RTPTransceiver, simulcast bool) {
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

func (u *User) startRecording() error {
	log.Printf("%s: starting recording", u.cfg.Username)
	ctx, cancel := context.WithTimeout(context.Background(), HTTPRequestTimeout)
	defer cancel()
	res, err := u.client.DoAPIRequest(ctx, http.MethodPost,
		fmt.Sprintf("%s/plugins/com.mattermost.calls/calls/%s/recording/start", u.client.URL, u.cfg.ChannelID), "", "")
	defer res.Body.Close()

	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}

	if res.StatusCode == 200 {
		return nil
	}

	return fmt.Errorf("unexpected status code %d", res.StatusCode)
}

func (u *User) transmitScreen(simulcast bool) {
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

func (u *User) transmitAudio() {
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
				log.Printf("%s: failed to read rtcp: %s", u.cfg.Username, rtcpErr.Error())
				return
			}
		}
	}()

	go func() {
		// Open a OGG file and start reading using our OGGReader
		file, oggErr := os.Open(u.cfg.SpeechFile)
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

func (u *User) Unmute() {
	select {
	case u.wsSendCh <- wsMsg{event: "custom_com.mattermost.calls_unmute", data: nil}:
	default:
		log.Printf("failed to send ws message")
	}
}

func (u *User) Mute() {
	select {
	case u.wsSendCh <- wsMsg{event: "custom_com.mattermost.calls_mute", data: nil}:
	default:
		log.Printf("failed to send ws message")
	}
}

func (u *User) transmitSpeech() {
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
				log.Printf("%s: failed to read rtcp: %s", u.cfg.Username, rtcpErr.Error())
				return
			}
		}
	}()

	go func() {
		// Wait for connection established
		<-u.connectedCh

		enc, err := opus.NewEncoder(24000, 1, opus.AppVoIP)
		if err != nil {
			log.Fatalf("%s: failed to create opus encoder: %s", u.cfg.Username, err.Error())
		}

		for text := range u.speechTextCh {
			func() {
				defer func() {
					u.doneSpeakingCh <- struct{}{}
				}()
				log.Printf("%s: received text to speak: %q", u.cfg.Username, text)

				var rd io.Reader
				var rate int
				var err error
				if u.pollySession != nil {
					rd, rate, err = u.pollyToSpeech(text)
				} else {
					rd, rate, err = textToSpeech(text)
				}
				if err != nil {
					log.Printf("%s: textToSpeech failed: %s", u.cfg.Username, err.Error())
					return
				}

				log.Printf("%s: raw speech samples decoded (%d)", u.cfg.Username, rate)

				audioSamplesDataBuf := bytes.NewBuffer([]byte{})
				if _, err := audioSamplesDataBuf.ReadFrom(rd); err != nil {
					log.Printf("%s: failed to read samples data: %s", u.cfg.Username, err.Error())
					return
				}

				log.Printf("read %d samples bytes", audioSamplesDataBuf.Len())

				sampleDuration := time.Millisecond * 20
				ticker := time.NewTicker(sampleDuration)
				audioSamplesData := make([]byte, 480*4)
				audioSamples := make([]int16, 480)
				opusData := make([]byte, 8192)
				for ; true; <-ticker.C {
					n, err := audioSamplesDataBuf.Read(audioSamplesData)
					if err != nil {
						if !errors.Is(err, io.EOF) {
							log.Printf("%s: failed to read audio samples: %s", u.cfg.Username, err.Error())
						}
						break
					}

					// Convert []byte to []int16
					for i := 0; i < n; i += 4 {
						audioSamples[i/4] = int16(binary.LittleEndian.Uint16(audioSamplesData[i : i+4]))
					}

					n, err = enc.Encode(audioSamples, opusData)
					if err != nil {
						log.Printf("%s: failed to encode: %s", u.cfg.Username, err.Error())
						continue
					}

					if err := track.WriteSample(media.Sample{Data: opusData[:n], Duration: sampleDuration}); err != nil {
						log.Printf("%s: failed to write audio sample: %s", u.cfg.Username, err.Error())
					}
				}
			}()
		}
	}()
}

func (u *User) Speak(text string) chan struct{} {
	u.speechTextCh <- text
	return u.doneSpeakingCh
}

func (u *User) initRTC() error {
	log.Printf("%s: setting up RTC connection", u.cfg.Username)

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

	if u.cfg.Simulcast {
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
			log.Printf("%s: end of candidates", u.cfg.Username)
			select {
			case gatherCh <- struct{}{}:
			default:
			}
			return
		}

		log.Printf("%s: ice: %v", u.cfg.Username, c)

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
			log.Printf("%s: rtc connected", u.cfg.Username)
			close(u.connectedCh)

			if u.cfg.Recording && u.isHost {
				if err := u.startRecording(); err != nil {
					log.Printf("%s: failed to start recording: %s", u.cfg.Username, err)
				} else {
					log.Printf("%s: recording started successfully", u.cfg.Username)
				}
			}
		}

		if connectionState == webrtc.ICEConnectionStateDisconnected || connectionState == webrtc.ICEConnectionStateFailed {
			log.Printf("%s: ice disconnect", u.cfg.Username)
			close(u.wsCloseCh)
		}
	})

	pc.OnTrack(func(track *webrtc.TrackRemote, receiver *webrtc.RTPReceiver) {
		if track.Kind() == webrtc.RTPCodecTypeVideo {
			rtcpSendErr := pc.WriteRTCP([]rtcp.Packet{&rtcp.PictureLossIndication{MediaSSRC: uint32(track.SSRC())}})
			if rtcpSendErr != nil {
				log.Printf("%s: rtcp send error: %s", u.cfg.Username, rtcpSendErr.Error())
			}
		}

		codecName := strings.Split(track.Codec().RTPCodecCapability.MimeType, "/")[1]
		log.Printf("%s: Track has started, of type %d: %s \n", u.cfg.Username, track.PayloadType(), codecName)

		buf := make([]byte, receiveMTU)
		for {
			_, _, readErr := track.Read(buf)
			if readErr != nil {
				log.Printf("%s: track read error: %s", u.cfg.Username, readErr.Error())
				return
			}
		}
	})

	if u.cfg.Unmuted {
		u.transmitAudio()
	} else if u.cfg.Speak {
		u.transmitSpeech()
	}

	if u.cfg.ScreenSharing {
		u.transmitScreen(u.cfg.Simulcast)
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

func (u *User) handleSignal(ev *model.WebSocketEvent) {
	evData := ev.GetData()
	var data map[string]interface{}
	if err := json.Unmarshal([]byte(evData["data"].(string)), &data); err != nil {
		log.Fatalf(err.Error())
	}

	t, _ := data["type"].(string)

	if t == "candidate" {
		log.Printf("%s: ice!", u.cfg.Username)
		u.iceCh <- webrtc.ICECandidateInit{Candidate: data["candidate"].(map[string]interface{})["candidate"].(string)}
	} else if t == "answer" {
		log.Printf("%s: sdp answer!", u.cfg.Username)
		if err := u.pc.SetRemoteDescription(webrtc.SessionDescription{
			Type: webrtc.SDPTypeAnswer,
			SDP:  data["sdp"].(string),
		}); err != nil {
			log.Fatalf("%s: SetRemoteDescription failed: %s", u.cfg.Username, err.Error())
		}

		go func() {
			for ice := range u.iceCh {
				if err := u.pc.AddICECandidate(ice); err != nil {
					log.Printf("%s: %s", u.cfg.Username, err.Error())
				}
			}
		}()

	} else if t == "offer" {
		log.Printf("%s: sdp offer", u.cfg.Username)

		if u.pc.SignalingState() != webrtc.SignalingStateStable {
			log.Printf("%s: signaling conflict on offer, queuing", u.cfg.Username)
			go func() {
				time.Sleep(100 * time.Millisecond)
				log.Printf("%s: applying previously queued offer", u.cfg.Username)
				u.handleSignal(ev)
			}()
			return
		}

		if err := u.pc.SetRemoteDescription(webrtc.SessionDescription{
			Type: webrtc.SDPTypeOffer,
			SDP:  data["sdp"].(string),
		}); err != nil {
			log.Fatalf("%s: SetRemoteDescription failed: %s", u.cfg.Username, err.Error())
		}

		sdp, err := u.pc.CreateAnswer(nil)
		if err != nil {
			log.Printf("%s: %s", u.cfg.Username, err.Error())
		}

		if err := u.pc.SetLocalDescription(sdp); err != nil {
			log.Printf("%s: SetLocalDescription failed: %s", u.cfg.Username, err.Error())
		}

		var sdpData bytes.Buffer
		w := zlib.NewWriter(&sdpData)
		if err := json.NewEncoder(w).Encode(sdp); err != nil {
			log.Fatalf("%s: %s", u.cfg.Username, err.Error())
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

func (u *User) wsListen(authToken string) {
	defer close(u.iceCh)

	var wsConnID string
	var originalConnID string
	var wsServerSeq int64

	connect := func() (*ws.Client, error) {
		ws, err := ws.NewClient(&ws.ClientParams{
			WsURL:          u.cfg.WsURL,
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
			log.Printf("%s: ws send error: %s", u.cfg.Username, err.Error())
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
						"channelID":      u.cfg.ChannelID,
						"originalConnID": originalConnID,
						"prevConnID":     wsConnID,
					}
					if err := ws.SendMessage("custom_com.mattermost.calls_reconnect", data); err != nil {
						log.Printf("%s: ws send error: %s", u.cfg.Username, err.Error())
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

						log.Printf("%s: joining call", u.cfg.Username)
						data := map[string]interface{}{
							"channelID": u.cfg.ChannelID,
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
				if channelID == u.cfg.ChannelID && hostID == u.userID {
					log.Printf("%s: I am call host", u.cfg.Username)
					u.isHost = true
				}
				continue
			}

			if connID, ok := ev.GetData()["connID"].(string); !ok || (connID != wsConnID && connID != originalConnID) {
				continue
			}

			switch ev.EventType() {
			case "custom_com.mattermost.calls_join":
				log.Printf("%s: joined call", u.cfg.Username)
				if err := u.initRTC(); err != nil {
					log.Fatalf(err.Error())
				}
				defer u.pc.Close()
			case "custom_com.mattermost.calls_signal":
				log.Printf("%s: received signal", u.cfg.Username)
				select {
				case <-u.initCh:
					u.handleSignal(ev)
				case <-time.After(2 * time.Second):
					log.Printf("%s: timed out waiting for init", u.cfg.Username)
				}
			case "custom_com.mattermost.calls_call_end":
				log.Printf("%s: call end event, exiting", u.cfg.Username)
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

func (u *User) Connect(stopCh chan struct{}) error {
	log.Printf("%s: connecting user", u.cfg.Username)

	var user *model.User
	client := model.NewAPIv4Client(u.cfg.SiteURL)
	u.client = client
	// login (or create) user
	ctx, cancel := context.WithTimeout(context.Background(), HTTPRequestTimeout)
	defer cancel()
	user, _, err := client.Login(ctx, u.cfg.Username, u.cfg.Password)
	appErr, ok := err.(*model.AppError)
	if err != nil && !ok {
		return err
	}
	cancel()

	if ok && appErr != nil && appErr.Id != "api.user.login.invalid_credentials_email_username" {
		return err
	} else if ok && appErr != nil && appErr.Id == "api.user.login.invalid_credentials_email_username" {
		if !u.cfg.Setup {
			return fmt.Errorf("cannot register user with setup disabled")
		}

		log.Printf("%s: registering user", u.cfg.Username)
		ctx, cancel := context.WithTimeout(context.Background(), HTTPRequestTimeout)
		user, _, err = client.CreateUser(ctx, &model.User{
			Username: u.cfg.Username,
			Password: u.cfg.Password,
			Email:    u.cfg.Username + "@example.com",
		})
		cancel()
		if err != nil {
			return err
		}
		ctx, cancel = context.WithTimeout(context.Background(), HTTPRequestTimeout)
		defer cancel()
		user, _, err = client.Login(ctx, u.cfg.Username, u.cfg.Password)
		if err != nil {
			return err
		}
		cancel()
	}

	log.Printf("%s: logged in", u.cfg.Username)
	u.userID = user.Id

	// join team
	if u.cfg.Setup {
		ctx, cancel = context.WithTimeout(context.Background(), HTTPRequestTimeout)
		defer cancel()
		_, _, err = client.AddTeamMember(ctx, u.cfg.TeamID, user.Id)
		if err != nil {
			return err
		}
		cancel()

		ctx, cancel = context.WithTimeout(context.Background(), HTTPRequestTimeout)
		defer cancel()
		channel, _, err := client.GetChannel(ctx, u.cfg.ChannelID, "")
		if err != nil {
			return err
		}
		cancel()

		if channel.Type == "O" || channel.Type == "P" {
			// join channel
			ctx, cancel = context.WithTimeout(context.Background(), HTTPRequestTimeout)
			defer cancel()
			_, _, err = client.AddChannelMember(ctx, u.cfg.ChannelID, user.Id)
			if err != nil {
				return err
			}
			cancel()
		}
	}

	log.Printf("%s: connecting to websocket", u.cfg.Username)

	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		u.wsListen(client.AuthToken)
	}()

	ticker := time.NewTicker(u.cfg.Duration)
	defer ticker.Stop()

	select {
	case <-ticker.C:
	case <-stopCh:
	}

	log.Printf("%s: disconnecting...", u.cfg.Username)
	close(u.doneCh)
	wg.Wait()

	log.Printf("%s: disconnected", u.cfg.Username)

	return nil
}
