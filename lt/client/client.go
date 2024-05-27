package client

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"log/slog"
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

	log *slog.Logger
}

type Option func(u *User)

func WithLogger(log *slog.Logger) Option {
	return func(u *User) {
		u.log = log
	}
}

func NewUser(cfg Config, opts ...Option) *User {
	u := &User{
		cfg:            cfg,
		speechTextCh:   make(chan string, 8),
		doneSpeakingCh: make(chan struct{}),
		pollySession:   cfg.PollySession,
		pollyVoiceID:   cfg.PollyVoiceID,
	}

	for _, opt := range opts {
		opt(u)
	}

	if u.log == nil {
		u.log = slog.Default()
	}

	return u
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
	file, ivfErr := os.Open(fmt.Sprintf("./samples/screen_%s.ivf", track.RID()))
	if ivfErr != nil {
		u.log.Error(ivfErr.Error())
		os.Exit(1)
	}
	defer file.Close()

	ivf, header, ivfErr := ivfreader.NewWith(file)
	if ivfErr != nil {
		u.log.Error(ivfErr.Error())
		os.Exit(1)
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
					u.log.Error(ivfErr.Error())
					os.Exit(1)
				}
				return file
			})
			frame, _, ivfErr = ivf.ParseNextFrame()
		}
		if ivfErr != nil {
			u.log.Error(ivfErr.Error())
			os.Exit(1)
		}

		packets := packetizer.Packetize(frame, rtpVideoCodecVP8.ClockRate/header.TimebaseDenominator)
		for _, p := range packets {
			if u.callsConfig["EnableSimulcast"].(bool) {
				if err := p.Header.SetExtension(getExtensionID(rtpVideoExtensions[0]), []byte(trx.Mid())); err != nil {
					u.log.Error("failed to set header extension", slog.String("err", err.Error()))
				}

				if err := p.Header.SetExtension(getExtensionID(rtpVideoExtensions[1]), []byte(track.RID())); err != nil {
					u.log.Error("failed to set header extension", slog.String("err", err.Error()))
				}
			}

			if err := track.WriteRTP(p); err != nil {
				u.log.Error("failed to write video sample", slog.String("err", err.Error()))
				return
			}
		}
	}
}

func (u *User) transmitScreen() {
	streamID := model.NewId()

	trackHigh, err := webrtc.NewTrackLocalStaticRTP(rtpVideoCodecVP8, "video", streamID, webrtc.WithRTPStreamID(simulcastLevelHigh))
	if err != nil {
		u.log.Error(err.Error())
		os.Exit(1)
	}

	tracks := []webrtc.TrackLocal{trackHigh}

	var trackLow *webrtc.TrackLocalStaticRTP
	if u.callsConfig["EnableSimulcast"].(bool) {
		trackLow, err = webrtc.NewTrackLocalStaticRTP(rtpVideoCodecVP8, "video", streamID, webrtc.WithRTPStreamID(simulcastLevelLow))
		if err != nil {
			u.log.Error(err.Error())
			os.Exit(1)
		}
		tracks = []webrtc.TrackLocal{trackLow, trackHigh}
	}

	trx, err := u.callsClient.StartScreenShare(tracks)
	if err != nil {
		u.log.Error(err.Error())
		os.Exit(1)
	}

	if u.callsConfig["EnableSimulcast"].(bool) {
		go u.sendVideoFile(trackLow, trx)
	}

	u.sendVideoFile(trackHigh, trx)
}

func (u *User) transmitAudio() {
	track, err := webrtc.NewTrackLocalStaticSample(rtpAudioCodec, "audio", "voice_"+model.NewId())
	if err != nil {
		u.log.Error(err.Error())
		os.Exit(1)
	}

	// Open a OGG file and start reading using our OGGReader
	file, oggErr := os.Open(u.cfg.SpeechFile)
	if oggErr != nil {
		u.log.Error(oggErr.Error())
		os.Exit(1)
	}
	defer file.Close()

	// Open on oggfile in non-checksum mode.
	ogg, _, oggErr := oggreader.NewWith(file)
	if oggErr != nil {
		u.log.Error(oggErr.Error())
		os.Exit(1)
	}

	if err := u.callsClient.Unmute(track); err != nil {
		u.log.Error(oggErr.Error())
		os.Exit(1)
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
			u.log.Error(oggErr.Error())
			os.Exit(1)
		}

		// The amount of samples is the difference between the last and current timestamp
		sampleCount := float64(pageHeader.GranulePosition - lastGranule)
		lastGranule = pageHeader.GranulePosition
		sampleDuration := time.Duration((sampleCount/48000)*1000) * time.Millisecond

		if err := track.WriteSample(media.Sample{Data: pageData, Duration: sampleDuration}); err != nil {
			u.log.Error("failed to write audio sample", slog.String("err", err.Error()))
		}
	}
}

func (u *User) Mute() error {
	if err := u.callsClient.Mute(); err != nil {
		u.log.Error("failed to mute", slog.String("err", err.Error()))
		return err
	}
	return nil
}

func (u *User) Unmute(track webrtc.TrackLocal) error {
	err := u.callsClient.Unmute(track)
	if err != nil {
		u.log.Error("failed to unmute", slog.String("err", err.Error()))
	}
	return err
}

func (u *User) transmitSpeech() {
	track, err := webrtc.NewTrackLocalStaticSample(rtpAudioCodec, "audio", "voice"+model.NewId())
	if err != nil {
		u.log.Error(err.Error())
		os.Exit(1)
	}

	enc, err := opus.NewEncoder(24000, 1, opus.AppVoIP)
	if err != nil {
		u.log.Error("failed to create opus encoder", slog.String("err", err.Error()))
	}

	for text := range u.speechTextCh {
		func() {
			defer func() {
				time.Sleep(100 * time.Millisecond)
				if err := u.Mute(); err != nil {
					u.log.Error(err.Error())
					os.Exit(1)
				}
				u.log.Debug("muted")
				u.doneSpeakingCh <- struct{}{}
			}()
			u.log.Debug("received text to speak: " + text)

			if err := u.Unmute(track); err != nil {
				u.log.Error(err.Error())
				os.Exit(1)
			}
			u.log.Debug("unmuted")

			var rd io.Reader
			var rate int
			var err error
			if u.pollySession != nil {
				rd, rate, err = u.pollyToSpeech(text)
			}
			if err != nil {
				u.log.Error("textToSpeech failed", slog.String("err", err.Error()))
				return
			}

			u.log.Debug("raw speech samples decoded", slog.Int("rate", rate))

			audioSamplesDataBuf := bytes.NewBuffer([]byte{})
			if _, err := audioSamplesDataBuf.ReadFrom(rd); err != nil {
				u.log.Error("failed to read samples data", slog.String("err", err.Error()))
				return
			}

			u.log.Debug("read samples bytes", slog.Int("len", audioSamplesDataBuf.Len()))

			sampleDuration := time.Millisecond * 20
			ticker := time.NewTicker(sampleDuration)
			audioSamplesData := make([]byte, 480*4)
			audioSamples := make([]int16, 480)
			opusData := make([]byte, 8192)
			for ; true; <-ticker.C {
				n, err := audioSamplesDataBuf.Read(audioSamplesData)
				if err != nil {
					if !errors.Is(err, io.EOF) {
						u.log.Error("failed to read audio samples", slog.String("err", err.Error()))
					}
					break
				}

				// Convert []byte to []int16
				for i := 0; i < n; i += 4 {
					audioSamples[i/4] = int16(binary.LittleEndian.Uint16(audioSamplesData[i : i+4]))
				}

				n, err = enc.Encode(audioSamples, opusData)
				if err != nil {
					u.log.Error("failed to encode: %s", u.cfg.Username, err.Error())
					continue
				}

				if err := track.WriteSample(media.Sample{Data: opusData[:n], Duration: sampleDuration}); err != nil {
					u.log.Error("failed to write audio sample: %s", u.cfg.Username, err.Error())
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
		u.log.Debug("I am host, starting recording")
		if err := u.callsClient.StartRecording(); err != nil {
			u.log.Error("failed to start recording", slog.String("err", err.Error()))
			os.Exit(1)
		}
	}
}

func (u *User) Connect(stopCh chan struct{}) error {
	u.log.Debug("connecting user")

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
		return fmt.Errorf("login failed: %w", err)
	} else if ok && appErr != nil && appErr.Id == "api.user.login.invalid_credentials_email_username" {
		if !u.cfg.Setup {
			return fmt.Errorf("cannot register user with setup disabled")
		}

		u.log.Debug("registering user")
		ctx, cancel := context.WithTimeout(context.Background(), HTTPRequestTimeout)
		_, _, err = apiClient.CreateUser(ctx, &model.User{
			Username: u.cfg.Username,
			Password: u.cfg.Password,
			Email:    u.cfg.Username + "@example.com",
		})
		cancel()
		if err != nil {
			return fmt.Errorf("create user failed: %w", err)
		}
		ctx, cancel = context.WithTimeout(context.Background(), HTTPRequestTimeout)
		defer cancel()
		user, _, err = apiClient.Login(ctx, u.cfg.Username, u.cfg.Password)
		if err != nil {
			return fmt.Errorf("login failed: %w", err)
		}
		cancel()
	}

	u.log.Debug("logged in")
	u.userID = user.Id

	// Need to sleep a little here since login can be racy
	time.Sleep(time.Second)

	// join team
	if u.cfg.Setup {
		ctx, cancel = context.WithTimeout(context.Background(), HTTPRequestTimeout)
		defer cancel()
		_, _, err = apiClient.AddTeamMember(ctx, u.cfg.TeamID, user.Id)
		if err != nil {
			return fmt.Errorf("failed to add team member: %w", err)
		}
		cancel()

		ctx, cancel = context.WithTimeout(context.Background(), HTTPRequestTimeout)
		defer cancel()
		channel, _, err := apiClient.GetChannel(ctx, u.cfg.ChannelID, "")
		if err != nil {
			return fmt.Errorf("failed to get channel: %w", err)
		}
		cancel()

		if channel.Type == "O" || channel.Type == "P" {
			// join channel
			ctx, cancel = context.WithTimeout(context.Background(), HTTPRequestTimeout)
			defer cancel()
			_, _, err = apiClient.AddChannelMember(ctx, u.cfg.ChannelID, user.Id)
			if err != nil {
				return fmt.Errorf("failed to add channel member: %w", err)
			}
			cancel()
		}
	}

	u.log.Debug("creating calls client")

	callsClient, err := client.New(client.Config{
		SiteURL:   u.cfg.SiteURL,
		AuthToken: apiClient.AuthToken,
		ChannelID: u.cfg.ChannelID,
	}, client.WithLogger(u.log))
	if err != nil {
		return fmt.Errorf("failed to create calls client: %w", err)
	}

	callsConfig, err := callsClient.GetCallsConfig()
	if err != nil {
		return fmt.Errorf("failed to get calls config: %w", err)
	}

	u.callsClient = callsClient
	u.callsConfig = callsConfig

	u.log.Debug("connecting to call")

	var connectOnce sync.Once
	err = callsClient.On(client.RTCConnectEvent, func(_ any) error {
		u.log.Debug("connected to call")
		connectOnce.Do(u.onConnect)
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to subscribe to connect event: %w", err)
	}

	closedCh := make(chan struct{})
	err = callsClient.On(client.CloseEvent, func(_ any) error {
		u.log.Debug("disconnected from call")
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

	errCh := make(chan error, 1)
	err = callsClient.On(client.ErrorEvent, func(ctx any) error {
		errCh <- ctx.(error)
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to subscribe to close event: %w", err)
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
	case err := <-errCh:
		callsClient.Close()
		return err
	}

	u.log.Debug("disconnecting...")

	if err := callsClient.Close(); err != nil {
		return fmt.Errorf("failed to close calls client: %w", err)
	}

	select {
	case <-closedCh:
	case <-time.After(10 * time.Second):
		return fmt.Errorf("timed out waiting for close event")
	}

	u.log.Debug("disconnected")

	return nil
}
