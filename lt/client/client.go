package client

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"sync"
	"sync/atomic"
	"time"

	"github.com/mattermost/rtcd/client"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/pion/rtp"
	"github.com/pion/rtp/codecs"
	"github.com/pion/webrtc/v3"
	"github.com/pion/webrtc/v3/pkg/media"
	"github.com/pion/webrtc/v3/pkg/media/ivfreader"
	"github.com/pion/webrtc/v3/pkg/media/oggreader"

	"github.com/aws/aws-sdk-go/service/polly"
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
	Setup         bool
	SpeechFile    string
	PollySession  *polly.Polly
	PollyVoiceID  *string
}

type User struct {
	userID      string
	cfg         Config
	apiClient   *model.Client4
	callsClient *client.Client
	callsConfig map[string]any
	hostID      atomic.Value

	pollySession   *polly.Polly
	pollyVoiceID   *string
	speechTextCh   chan string
	doneSpeakingCh chan struct{}
}

func NewUser(cfg Config) *User {
	return &User{
		cfg:            cfg,
		speechTextCh:   make(chan string, 8),
		doneSpeakingCh: make(chan struct{}),
		pollySession:   cfg.PollySession,
		pollyVoiceID:   cfg.PollyVoiceID,
	}
}

func (u *User) sendVideoFile(track *webrtc.TrackLocalStaticRTP, trx *webrtc.RTPTransceiver) {
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
	file, ivfErr := os.Open(fmt.Sprintf("./samples/video_%s.ivf", track.RID()))
	if ivfErr != nil {
		log.Fatalf(ivfErr.Error())
	}
	defer file.Close()

	ivf, header, ivfErr := ivfreader.NewWith(file)
	if ivfErr != nil {
		log.Fatalf(ivfErr.Error())
	}

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
			if u.callsConfig["EnableSimulcast"].(bool) {
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

func (u *User) transmitScreen() {
	streamID := model.NewId()

	trackHigh, err := webrtc.NewTrackLocalStaticRTP(rtpVideoCodecVP8, "video", streamID, webrtc.WithRTPStreamID(simulcastLevelHigh))
	if err != nil {
		log.Fatalf(err.Error())
	}

	tracks := []webrtc.TrackLocal{trackHigh}

	var trackLow *webrtc.TrackLocalStaticRTP
	if u.callsConfig["EnableSimulcast"].(bool) {
		trackLow, err = webrtc.NewTrackLocalStaticRTP(rtpVideoCodecVP8, "video", streamID, webrtc.WithRTPStreamID(simulcastLevelLow))
		if err != nil {
			log.Fatalf(err.Error())
		}
		tracks = []webrtc.TrackLocal{trackLow, trackHigh}
	}

	trx, err := u.callsClient.StartScreenShare(tracks)
	if err != nil {
		log.Fatalf(err.Error())
	}

	if u.callsConfig["EnableSimulcast"].(bool) {
		go u.sendVideoFile(trackLow, trx)
	}

	u.sendVideoFile(trackHigh, trx)
}

func (u *User) transmitAudio() {
	track, err := webrtc.NewTrackLocalStaticSample(rtpAudioCodec, "audio", "voice_"+model.NewId())
	if err != nil {
		log.Fatalf(err.Error())
	}

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

	if err := u.callsClient.Unmute(track); err != nil {
		log.Fatalf(err.Error())
	}

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
}

func (u *User) Mute() {
	if err := u.callsClient.Mute(); err != nil {
		log.Printf("%s: failed to mute: %s", u.cfg.Username, err.Error())
	}
}

func (u *User) transmitSpeech() {
	track, err := webrtc.NewTrackLocalStaticSample(rtpAudioCodec, "audio", "voice"+model.NewId())
	if err != nil {
		log.Fatalf(err.Error())
	}

	enc, err := opus.NewEncoder(24000, 1, opus.AppVoIP)
	if err != nil {
		log.Fatalf("%s: failed to create opus encoder: %s", u.cfg.Username, err.Error())
	}

	if err := u.callsClient.Unmute(track); err != nil {
		log.Fatalf(err.Error())
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
}

func (u *User) Speak(text string) chan struct{} {
	u.speechTextCh <- text
	return u.doneSpeakingCh
}

func (u *User) onConnect() {
	if u.cfg.Unmuted {
		go u.transmitAudio()
	} else if u.cfg.Speak {
		go u.transmitSpeech()
	}
	if u.cfg.ScreenSharing {
		go u.transmitScreen()
	}

	if u.cfg.Recording && u.hostID.Load() == u.userID {
		log.Printf("%s: I am host, starting recording", u.cfg.Username)
		if err := u.callsClient.StartRecording(); err != nil {
			log.Fatalf("failed to start recording: %s", err.Error())
		}
	}
}

func (u *User) Connect(stopCh chan struct{}) error {
	log.Printf("%s: connecting user", u.cfg.Username)

	var user *model.User
	apiClient := model.NewAPIv4Client(u.cfg.SiteURL)
	u.apiClient = apiClient
	// login (or create) user
	ctx, cancel := context.WithTimeout(context.Background(), HTTPRequestTimeout)
	defer cancel()
	user, _, err := apiClient.Login(ctx, u.cfg.Username, u.cfg.Password)
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
		_, _, err = apiClient.CreateUser(ctx, &model.User{
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
		user, _, err = apiClient.Login(ctx, u.cfg.Username, u.cfg.Password)
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
		_, _, err = apiClient.AddTeamMember(ctx, u.cfg.TeamID, user.Id)
		if err != nil {
			return err
		}
		cancel()

		ctx, cancel = context.WithTimeout(context.Background(), HTTPRequestTimeout)
		defer cancel()
		channel, _, err := apiClient.GetChannel(ctx, u.cfg.ChannelID, "")
		if err != nil {
			return err
		}
		cancel()

		if channel.Type == "O" || channel.Type == "P" {
			// join channel
			ctx, cancel = context.WithTimeout(context.Background(), HTTPRequestTimeout)
			defer cancel()
			_, _, err = apiClient.AddChannelMember(ctx, u.cfg.ChannelID, user.Id)
			if err != nil {
				return err
			}
			cancel()
		}
	}

	log.Printf("%s: creating calls client", u.cfg.Username)

	callsClient, err := client.New(client.Config{
		SiteURL:   u.cfg.SiteURL,
		AuthToken: apiClient.AuthToken,
		ChannelID: u.cfg.ChannelID,
	})
	if err != nil {
		return fmt.Errorf("failed to create calls client: %w", err)
	}

	callsConfig, err := callsClient.GetCallsConfig()
	if err != nil {
		return fmt.Errorf("failed to get calls config: %w", err)
	}

	u.callsClient = callsClient
	u.callsConfig = callsConfig

	log.Printf("%s: connecting to call", u.cfg.Username)

	var connectOnce sync.Once
	err = callsClient.On(client.RTCConnectEvent, func(_ any) error {
		log.Printf("%s: connected to call", u.cfg.Username)
		connectOnce.Do(u.onConnect)
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to subscribe to connect event: %w", err)
	}

	closedCh := make(chan struct{})
	err = callsClient.On(client.CloseEvent, func(_ any) error {
		log.Printf("%s: disconnected from call", u.cfg.Username)
		close(closedCh)
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to subscribe to close event: %w", err)
	}

	err = callsClient.On(client.WSCallHostChangedEvent, func(ctx any) error {
		u.hostID.Store(ctx.(string))
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to subscribe to host changed event: %w", err)
	}

	if err := callsClient.Connect(); err != nil {
		return fmt.Errorf("failed to connect: %w", err)
	}

	ticker := time.NewTicker(u.cfg.Duration)
	defer ticker.Stop()

	select {
	case <-ticker.C:
	case <-closedCh:
	case <-stopCh:
	}

	log.Printf("%s: disconnecting...", u.cfg.Username)

	if err := callsClient.Close(); err != nil {
		return fmt.Errorf("failed to close calls client: %w", err)
	}

	select {
	case <-closedCh:
	case <-time.After(10 * time.Second):
		return fmt.Errorf("timed out waiting for close event")
	}

	log.Printf("%s: disconnected", u.cfg.Username)

	return nil
}
