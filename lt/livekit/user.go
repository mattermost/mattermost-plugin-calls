// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package livekit

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"sync/atomic"
	"time"

	lksdk "github.com/livekit/server-sdk-go/v2"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/pion/rtcp"
	"github.com/pion/webrtc/v4"
	"github.com/pion/webrtc/v4/pkg/media"
	"github.com/pion/webrtc/v4/pkg/media/ivfreader"
	"github.com/pion/webrtc/v4/pkg/media/oggreader"
)

const (
	pluginID           = "com.mattermost.calls"
	HTTPRequestTimeout = 10 * time.Second
)

const (
	defaultSpeechFile = "./samples/speech_0.ogg"
	defaultVideoFile  = "./samples/video_h.ivf"
)

type Config struct {
	Username   string
	Password   string
	TeamID     string
	ChannelID  string
	SiteURL    string
	Duration   time.Duration
	Unmuted    bool
	Video      bool
	SpeechFile string
	VideoFile  string
	Setup      bool
}

type User struct {
	cfg Config
	log *slog.Logger
}

func NewUser(cfg Config, log *slog.Logger) *User {
	return &User{cfg: cfg, log: log}
}

// loopingOggProvider implements lksdk.AudioSampleProvider, looping the OGG file at EOF.
type loopingOggProvider struct {
	filename       string
	file           *os.File
	ogg            *oggreader.OggReader
	lastGranule    uint64
	resetRequested atomic.Bool
}

func (p *loopingOggProvider) requestReset() {
	p.resetRequested.Store(true)
}

func newLoopingOggProvider(filename string) (*loopingOggProvider, error) {
	p := &loopingOggProvider{filename: filename}
	if err := p.reset(); err != nil {
		return nil, err
	}
	return p, nil
}

func (p *loopingOggProvider) reset() error {
	if p.file != nil {
		p.file.Close()
	}
	var err error
	p.file, err = os.Open(p.filename)
	if err != nil {
		return err
	}
	p.ogg, _, err = oggreader.NewWith(p.file)
	if err != nil {
		p.file.Close()
		return err
	}
	p.lastGranule = 0
	return nil
}

func (p *loopingOggProvider) NextSample(_ context.Context) (media.Sample, error) {
	if p.resetRequested.CompareAndSwap(true, false) {
		if err := p.reset(); err != nil {
			return media.Sample{}, err
		}
	}
	pageData, pageHeader, err := p.ogg.ParseNextPage()
	if err == io.EOF {
		if resetErr := p.reset(); resetErr != nil {
			return media.Sample{}, resetErr
		}
		pageData, pageHeader, err = p.ogg.ParseNextPage()
	}
	if err != nil {
		return media.Sample{}, err
	}
	sampleCount := float64(pageHeader.GranulePosition - p.lastGranule)
	p.lastGranule = pageHeader.GranulePosition
	duration := time.Duration((sampleCount/48000)*1000) * time.Millisecond
	return media.Sample{Data: pageData, Duration: duration}, nil
}

func (p *loopingOggProvider) OnBind() error   { return nil }
func (p *loopingOggProvider) OnUnbind() error { return nil }
func (p *loopingOggProvider) Close() error {
	if p.file != nil {
		return p.file.Close()
	}
	return nil
}
func (p *loopingOggProvider) CurrentAudioLevel() uint8 { return 15 }

// loopingIVFProvider implements lksdk.SampleProvider, looping the IVF file at EOF.
// It also handles PLI/FIR by resetting to the start of the file (a keyframe).
type loopingIVFProvider struct {
	filename          string
	file              *os.File
	ivf               *ivfreader.IVFReader
	ivfTimebase       float64
	lastTimestamp     uint64
	keyFrameRequested atomic.Bool
	onReset           func() // called whenever the video resets to frame 0
}

func newLoopingIVFProvider(filename string) (*loopingIVFProvider, error) {
	p := &loopingIVFProvider{filename: filename}
	if err := p.reset(); err != nil {
		return nil, err
	}
	return p, nil
}

func (p *loopingIVFProvider) reset() error {
	if p.file != nil {
		p.file.Close()
	}
	var err error
	p.file, err = os.Open(p.filename)
	if err != nil {
		return err
	}
	var header *ivfreader.IVFFileHeader
	p.ivf, header, err = ivfreader.NewWith(p.file)
	if err != nil {
		p.file.Close()
		return err
	}
	p.ivfTimebase = float64(header.TimebaseNumerator) / float64(header.TimebaseDenominator)
	p.lastTimestamp = 0
	return nil
}

func (p *loopingIVFProvider) NextSample(_ context.Context) (media.Sample, error) {
	// On PLI/FIR, seek back to the start of the file so the browser gets a keyframe.
	if p.keyFrameRequested.CompareAndSwap(true, false) {
		if err := p.reset(); err != nil {
			return media.Sample{}, err
		}
		if p.onReset != nil {
			p.onReset()
		}
	}
	frame, header, err := p.ivf.ParseNextFrame()
	if err == io.EOF || (err != nil && err.Error() == "incomplete frame data") {
		if resetErr := p.reset(); resetErr != nil {
			return media.Sample{}, resetErr
		}
		if p.onReset != nil {
			p.onReset()
		}
		frame, header, err = p.ivf.ParseNextFrame()
	}
	if err != nil {
		return media.Sample{}, err
	}
	delta := header.Timestamp - p.lastTimestamp
	p.lastTimestamp = header.Timestamp
	duration := time.Duration(p.ivfTimebase*float64(delta)*1000) * time.Millisecond
	return media.Sample{Data: frame, Duration: duration}, nil
}

func (p *loopingIVFProvider) requestKeyFrame() {
	p.keyFrameRequested.Store(true)
}

func (p *loopingIVFProvider) OnBind() error   { return nil }
func (p *loopingIVFProvider) OnUnbind() error { return nil }
func (p *loopingIVFProvider) Close() error {
	if p.file != nil {
		return p.file.Close()
	}
	return nil
}

// Connect logs in to Mattermost, joins the call via WS, connects to the LiveKit room,
// publishes A/V from files, and disconnects cleanly when done or stopCh is closed.
func (u *User) Connect(stopCh <-chan struct{}) error {
	// 1. Log in to Mattermost.
	apiClient := model.NewAPIv4Client(u.cfg.SiteURL)
	ctx, cancel := context.WithTimeout(context.Background(), HTTPRequestTimeout)
	user, _, err := apiClient.Login(ctx, u.cfg.Username, u.cfg.Password)
	cancel()
	if err != nil {
		if !u.cfg.Setup {
			return fmt.Errorf("login failed: %w", err)
		}
		ctx, cancel = context.WithTimeout(context.Background(), HTTPRequestTimeout)
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
		user, _, err = apiClient.Login(ctx, u.cfg.Username, u.cfg.Password)
		cancel()
		if err != nil {
			return fmt.Errorf("login after create failed: %w", err)
		}
	}

	u.log.Debug("logged in")
	// Small sleep to avoid login race (matches existing lt client behaviour).
	time.Sleep(time.Second)

	// 2. Join team and channel if setup is enabled.
	if u.cfg.Setup {
		if u.cfg.TeamID != "" {
			ctx, cancel = context.WithTimeout(context.Background(), HTTPRequestTimeout)
			_, _, err = apiClient.AddTeamMember(ctx, u.cfg.TeamID, user.Id)
			cancel()
			if err != nil {
				u.log.Warn("failed to add team member (may already be a member)", slog.String("err", err.Error()))
			}
		}
		ctx, cancel = context.WithTimeout(context.Background(), HTTPRequestTimeout)
		_, _, err = apiClient.AddChannelMember(ctx, u.cfg.ChannelID, user.Id)
		cancel()
		if err != nil {
			u.log.Warn("failed to add channel member (may already be a member)", slog.String("err", err.Error()))
		}
	}

	// 3. Connect Mattermost WebSocket for join/leave signalling.
	wsURL := strings.Replace(u.cfg.SiteURL, "https://", "wss://", 1)
	wsURL = strings.Replace(wsURL, "http://", "ws://", 1)
	wsClient, wsErr := model.NewWebSocketClient4(wsURL, apiClient.AuthToken)
	if wsErr != nil {
		return fmt.Errorf("failed to create websocket client: %w", wsErr)
	}
	wsClient.Listen()
	defer func() {
		wsClient.SendMessage(fmt.Sprintf("custom_%s_leave", pluginID), map[string]any{})
		time.Sleep(300 * time.Millisecond) // give the leave message time to flush
		wsClient.Close()
	}()

	// 4. Send join message so the plugin creates/updates call state.
	wsClient.SendMessage(fmt.Sprintf("custom_%s_join", pluginID), map[string]any{
		"channelID": u.cfg.ChannelID,
		"title":     "",
		"threadID":  "",
	})
	u.log.Debug("sent join message")

	// 5. Fetch LiveKit token from the plugin REST API.
	livekitURL, token, err := u.fetchLiveKitToken(apiClient)
	if err != nil {
		return fmt.Errorf("failed to fetch livekit token: %w", err)
	}
	u.log.Debug("got livekit token", slog.String("url", livekitURL))

	// 6. Connect to the LiveKit room.
	room, err := lksdk.ConnectToRoomWithToken(livekitURL, token, &lksdk.RoomCallback{},
		lksdk.WithAutoSubscribe(false),
	)
	if err != nil {
		return fmt.Errorf("failed to connect to livekit room: %w", err)
	}
	defer room.Disconnect()

	u.log.Debug("connected to livekit room")

	// 7. Publish audio track (looping OGG file).
	var audioProvider *loopingOggProvider
	if u.cfg.Unmuted {
		var err error
		audioProvider, err = u.publishAudio(room)
		if err != nil {
			u.log.Error("failed to publish audio", slog.String("err", err.Error()))
		}
	}

	// 8. Publish video track (looping IVF file).
	// Pass audioProvider so video resets trigger audio resets (A/V sync).
	if u.cfg.Video {
		if err := u.publishVideo(room, audioProvider); err != nil {
			u.log.Error("failed to publish video", slog.String("err", err.Error()))
		}
	}

	// 9. Wait for duration or stop signal.
	timer := time.NewTimer(u.cfg.Duration)
	defer timer.Stop()
	select {
	case <-timer.C:
	case <-stopCh:
	}

	u.log.Debug("disconnecting")
	return nil
}

func (u *User) fetchLiveKitToken(apiClient *model.Client4) (livekitURL, token string, err error) {
	ctx, cancel := context.WithTimeout(context.Background(), HTTPRequestTimeout)
	defer cancel()

	rawURL := fmt.Sprintf("%s/plugins/%s/livekit-token?channel_id=%s",
		u.cfg.SiteURL, pluginID, u.cfg.ChannelID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return "", "", err
	}
	req.Header.Set("Authorization", "Bearer "+apiClient.AuthToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", "", fmt.Errorf("token endpoint returned HTTP %d", resp.StatusCode)
	}

	var result struct {
		Token string `json:"token"`
		URL   string `json:"url"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", "", fmt.Errorf("failed to decode token response: %w", err)
	}
	return result.URL, result.Token, nil
}

func (u *User) publishAudio(room *lksdk.Room) (*loopingOggProvider, error) {
	speechFile := u.cfg.SpeechFile
	if speechFile == "" {
		speechFile = defaultSpeechFile
	}

	provider, err := newLoopingOggProvider(speechFile)
	if err != nil {
		return nil, fmt.Errorf("failed to create audio provider: %w", err)
	}

	track, err := lksdk.NewLocalTrack(webrtc.RTPCodecCapability{
		MimeType:    webrtc.MimeTypeOpus,
		ClockRate:   48000,
		Channels:    2,
		SDPFmtpLine: "minptime=10;useinbandfec=1",
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create audio track: %w", err)
	}

	track.OnBind(func() {
		if err := track.StartWrite(provider, nil); err != nil {
			u.log.Error("failed to start audio write", slog.String("err", err.Error()))
		}
	})

	if _, err := room.LocalParticipant.PublishTrack(track, &lksdk.TrackPublicationOptions{
		Name: "audio",
	}); err != nil {
		return nil, fmt.Errorf("failed to publish audio track: %w", err)
	}

	u.log.Debug("publishing audio", slog.String("file", speechFile))
	return provider, nil
}

func (u *User) publishVideo(room *lksdk.Room, audioProvider *loopingOggProvider) error {
	videoFile := u.cfg.VideoFile
	if videoFile == "" {
		videoFile = defaultVideoFile
	}

	provider, err := newLoopingIVFProvider(videoFile)
	if err != nil {
		return fmt.Errorf("failed to create video provider: %w", err)
	}
	if audioProvider != nil {
		provider.onReset = audioProvider.requestReset
	}

	track, err := lksdk.NewLocalTrack(webrtc.RTPCodecCapability{
		MimeType:  webrtc.MimeTypeVP8,
		ClockRate: 90000,
	}, lksdk.WithRTCPHandler(func(pkt rtcp.Packet) {
		switch pkt.(type) {
		case *rtcp.PictureLossIndication, *rtcp.FullIntraRequest:
			provider.requestKeyFrame()
		}
	}))
	if err != nil {
		return fmt.Errorf("failed to create video track: %w", err)
	}

	track.OnBind(func() {
		if err := track.StartWrite(provider, nil); err != nil {
			u.log.Error("failed to start video write", slog.String("err", err.Error()))
		}
	})

	if _, err := room.LocalParticipant.PublishTrack(track, &lksdk.TrackPublicationOptions{
		Name:        "video",
		VideoWidth:  640,
		VideoHeight: 480,
	}); err != nil {
		return fmt.Errorf("failed to publish video track: %w", err)
	}

	u.log.Debug("publishing video", slog.String("file", videoFile))
	return nil
}
