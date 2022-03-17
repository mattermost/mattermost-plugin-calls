package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"time"

	"github.com/mattermost/mattermost-server/v6/model"

	"github.com/pion/ice/v2"
	"github.com/pion/interceptor"
	"github.com/pion/interceptor/pkg/nack"
	"github.com/pion/rtcp"
	"github.com/pion/webrtc/v3"
	"github.com/prometheus/client_golang/prometheus"
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
)

const (
	nackResponderBufferSize = 256
)

func (p *Plugin) handleICE(us *session) {
	for {
		select {
		case data, ok := <-us.iceCh:
			if !ok {
				return
			}

			var candidate webrtc.ICECandidateInit
			if err := json.Unmarshal(data, &candidate); err != nil {
				p.LogError(err.Error())
				continue
			}

			if candidate.Candidate == "" {
				continue
			}

			p.LogDebug("setting ICE candidate for remote")

			if err := us.rtcConn.AddICECandidate(candidate); err != nil {
				p.LogError(err.Error())
				continue
			}
		case <-us.closeCh:
			return
		}
	}
}

func (p *Plugin) handleSignaling(us *session, msg []byte) error {
	us.mut.RLock()
	peerConn := us.rtcConn
	us.mut.RUnlock()

	var offer webrtc.SessionDescription
	if err := json.Unmarshal(msg, &offer); err != nil {
		return err
	}

	p.LogDebug(string(msg))

	if err := peerConn.SetRemoteDescription(offer); err != nil {
		return err
	}

	answer, err := peerConn.CreateAnswer(nil)
	if err != nil {
		return err
	}

	if err := peerConn.SetLocalDescription(answer); err != nil {
		return err
	}

	sdp, err := json.Marshal(peerConn.LocalDescription())
	if err != nil {
		return err
	}

	p.LogDebug(string(sdp))

	us.signalOutCh <- sdp

	return nil
}

func (p *Plugin) handlePLI(sender *webrtc.RTPSender, channelID string) {
	for {
		pkts, _, readErr := sender.ReadRTCP()
		if readErr != nil {
			p.LogError(readErr.Error())
			return
		}
		for _, pkt := range pkts {
			if _, ok := pkt.(*rtcp.PictureLossIndication); ok {
				call := p.getCall(channelID)
				if call == nil {
					p.LogError("call should not be nil")
					return
				}
				screenSession := call.getScreenSession()
				if screenSession == nil {
					p.LogError("screenSession should not be nil")
					return
				}
				if err := screenSession.rtcConn.WriteRTCP([]rtcp.Packet{&rtcp.PictureLossIndication{MediaSSRC: uint32(screenSession.remoteScreenTrack.SSRC())}}); err != nil {
					p.LogError(err.Error())
				}
			}
		}
	}
}

func (p *Plugin) addTrack(userSession *session, track *webrtc.TrackLocalStaticRTP, enabled bool) {
	p.LogDebug("addTrack", "userID", userSession.userID)
	userSession.mut.RLock()
	peerConn := userSession.rtcConn
	userSession.mut.RUnlock()

	t := track
	if !enabled {
		dummyTrack, err := webrtc.NewTrackLocalStaticRTP(rtpAudioCodec, "voice", model.NewId())
		if err != nil {
			p.LogError(err.Error())
			return
		}
		t = dummyTrack
	}

	sender, err := peerConn.AddTrack(t)
	if err != nil {
		p.LogError(err.Error())
		return
	} else if t.Kind() == webrtc.RTPCodecTypeVideo {
		go p.handlePLI(sender, userSession.channelID)
	}

	offer, err := peerConn.CreateOffer(nil)
	if err != nil {
		p.LogError(err.Error())
		return
	}

	err = peerConn.SetLocalDescription(offer)
	if err != nil {
		p.LogError(err.Error())
		return
	}

	sdp, err := json.Marshal(peerConn.LocalDescription())
	if err != nil {
		p.LogError(err.Error())
		return
	}

	userSession.signalOutCh <- sdp

	var answer webrtc.SessionDescription
	select {
	case msg, ok := <-userSession.signalInCh:
		if !ok {
			return
		}
		p.LogDebug(string(msg))
		if err := json.Unmarshal(msg, &answer); err != nil {
			p.LogError(err.Error())
			return
		}
	case <-time.After(signalingTimeout):
		p.LogError("timed out waiting for signaling message", "userID", userSession.userID)
	}

	if err := peerConn.SetRemoteDescription(answer); err != nil {
		p.LogError(err.Error())
		return
	}

	userSession.mut.Lock()
	userSession.rtpSendersMap[track] = sender
	userSession.mut.Unlock()
}

func initMediaEngine() (*webrtc.MediaEngine, error) {
	var m webrtc.MediaEngine
	if err := m.RegisterCodec(webrtc.RTPCodecParameters{
		RTPCodecCapability: rtpAudioCodec,
		PayloadType:        111,
	}, webrtc.RTPCodecTypeAudio); err != nil {
		return nil, err
	}
	if err := m.RegisterCodec(webrtc.RTPCodecParameters{
		RTPCodecCapability: rtpVideoCodecVP8,
		PayloadType:        96,
	}, webrtc.RTPCodecTypeVideo); err != nil {
		return nil, err
	}
	return &m, nil
}

func initInterceptors(m *webrtc.MediaEngine) (*interceptor.Registry, error) {
	var i interceptor.Registry
	generator, err := nack.NewGeneratorInterceptor()
	if err != nil {
		return nil, err
	}

	// NACK
	responder, err := nack.NewResponderInterceptor(nack.ResponderSize(nackResponderBufferSize))
	if err != nil {
		return nil, err
	}
	m.RegisterFeedback(webrtc.RTCPFeedback{Type: "nack"}, webrtc.RTPCodecTypeVideo)
	m.RegisterFeedback(webrtc.RTCPFeedback{Type: "nack", Parameter: "pli"}, webrtc.RTPCodecTypeVideo)
	i.Add(responder)
	i.Add(generator)

	// RTCP Reports
	if err := webrtc.ConfigureRTCPReports(&i); err != nil {
		return nil, err
	}

	return &i, nil
}

func (p *Plugin) initRTCConn(userID string) {
	peerConnConfig := webrtc.Configuration{
		ICEServers: []webrtc.ICEServer{
			{
				URLs: p.getConfiguration().ICEServers,
			},
		},
		SDPSemantics: webrtc.SDPSemanticsUnifiedPlanWithFallback,
	}

	m, err := initMediaEngine()
	if err != nil {
		p.LogError(err.Error())
		return
	}

	i, err := initInterceptors(m)
	if err != nil {
		p.LogError(err.Error())
		return
	}

	sEngine := webrtc.SettingEngine{}
	sEngine.SetICEMulticastDNSMode(ice.MulticastDNSModeDisabled)
	sEngine.SetICEUDPMux(p.udpServerMux)
	hostIP := p.hostIP
	if hostOverride := p.getConfiguration().ICEHostOverride; hostOverride != "" {
		hostIP, err = resolveHost(hostOverride, time.Second)
		if err != nil {
			p.LogError(err.Error())
			return
		}
	}
	sEngine.SetNAT1To1IPs([]string{hostIP}, webrtc.ICECandidateTypeHost)

	api := webrtc.NewAPI(webrtc.WithMediaEngine(m), webrtc.WithSettingEngine(sEngine), webrtc.WithInterceptorRegistry(i))
	peerConn, err := api.NewPeerConnection(peerConnConfig)
	if err != nil {
		p.LogError(err.Error())
		return
	}

	p.mut.RLock()
	userSession := p.sessions[userID]
	p.mut.RUnlock()
	if userSession == nil {
		p.LogError("userSession should not be nil")
		return
	}

	userSession.mut.Lock()
	userSession.rtcConn = peerConn
	userSession.mut.Unlock()

	peerConn.OnICECandidate(func(candidate *webrtc.ICECandidate) {
		if candidate != nil {
			p.LogDebug(fmt.Sprintf("ice candidate: %+v", candidate))
			data := make(map[string]interface{})
			data["type"] = "candidate"
			data["candidate"] = candidate.ToJSON()
			msg, err := json.Marshal(data)
			if err != nil {
				p.LogError(err.Error())
				return
			}
			userSession.signalOutCh <- msg
		}
	})

	peerConn.OnICEGatheringStateChange(func(state webrtc.ICEGathererState) {
		if state == webrtc.ICEGathererStateComplete {
			p.LogDebug("ice gathering complete")
		}
	})

	peerConn.OnConnectionStateChange(func(state webrtc.PeerConnectionState) {
		if state == webrtc.PeerConnectionStateConnected {
			p.LogDebug("rtc connected!", "UserID", userID)
			p.metrics.RTCConnStateCounters.With(prometheus.Labels{"type": "connected"}).Inc()
		} else if state == webrtc.PeerConnectionStateDisconnected {
			p.LogDebug("peer connection disconnected", "UserID", userID)
			p.metrics.RTCConnStateCounters.With(prometheus.Labels{"type": "disconnected"}).Inc()
		} else if state == webrtc.PeerConnectionStateFailed {
			p.LogDebug("peer connection failed", "UserID", userID)
			p.metrics.RTCConnStateCounters.With(prometheus.Labels{"type": "failed"}).Inc()
		} else if state == webrtc.PeerConnectionStateClosed {
			p.LogDebug("peer connection closed", "UserID", userID)
			p.metrics.RTCConnStateCounters.With(prometheus.Labels{"type": "closed"}).Inc()
		}
	})

	peerConn.OnICEConnectionStateChange(func(state webrtc.ICEConnectionState) {
		if state == webrtc.ICEConnectionStateDisconnected {
			p.LogDebug("ice disconnected", "UserID", userID)
		} else if state == webrtc.ICEConnectionStateFailed {
			p.LogDebug("ice failed", "UserID", userID)
		} else if state == webrtc.ICEConnectionStateClosed {
			p.LogDebug("ice closed", "UserID", userID)
		}
	})

	peerConn.OnTrack(func(remoteTrack *webrtc.TrackRemote, receiver *webrtc.RTPReceiver) {
		p.LogDebug("Got remote track!!!")
		p.LogDebug(fmt.Sprintf("%+v", remoteTrack.Codec().RTPCodecCapability))
		p.LogDebug(fmt.Sprintf("Track has started, of type %d: %s", remoteTrack.PayloadType(), remoteTrack.Codec().MimeType))

		trackID := remoteTrack.ID()
		state, err := p.kvGetChannelState(userSession.channelID)
		if err != nil {
			p.LogError(err.Error())
			return
		}
		if state.Call == nil {
			p.LogError("call state should not be nil")
			return
		}

		if remoteTrack.Codec().MimeType == rtpAudioCodec.MimeType {
			trackType := "voice"
			if trackID != "" && trackID == state.Call.ScreenAudioTrackID {
				p.LogDebug("received screen sharing audio track")
				trackType = "screen-audio"
			}
			outAudioTrack, err := webrtc.NewTrackLocalStaticRTP(rtpAudioCodec, trackType, model.NewId())
			if err != nil {
				p.LogError(err.Error())
				return
			}

			userSession.mut.Lock()
			if trackType == "voice" {
				userSession.outVoiceTrack = outAudioTrack
				userSession.outVoiceTrackEnabled = true
			} else {
				userSession.outScreenAudioTrack = outAudioTrack
			}
			userSession.mut.Unlock()

			p.iterSessions(userSession.channelID, func(s *session) {
				if s.userID == userSession.userID {
					return
				}
				select {
				case s.tracksCh <- outAudioTrack:
				default:
					p.LogError("failed to send audio track, channel is full", "userID", userID, "trackUserID", s.userID)
				}
			})

			for {
				rtp, _, readErr := remoteTrack.ReadRTP()
				if readErr != nil {
					p.LogError(readErr.Error())
					return
				}

				p.metrics.RTPPacketCounters.With(prometheus.Labels{"direction": "in", "type": trackType}).Inc()
				p.metrics.RTPPacketBytesCounters.With(prometheus.Labels{"direction": "in", "type": trackType}).Add(float64(len(rtp.Payload)))

				if trackType == "voice" {
					userSession.mut.RLock()
					isEnabled := userSession.outVoiceTrackEnabled
					userSession.mut.RUnlock()
					if !isEnabled {
						continue
					}
				}

				if err := outAudioTrack.WriteRTP(rtp); err != nil && !errors.Is(err, io.ErrClosedPipe) {
					p.LogError(err.Error())
					return
				}

				// TODO: improve this.
				p.iterSessions(userSession.channelID, func(s *session) {
					if s.userID == userSession.userID {
						return
					}
					p.metrics.RTPPacketCounters.With(prometheus.Labels{"direction": "out", "type": trackType}).Inc()
					p.metrics.RTPPacketBytesCounters.With(prometheus.Labels{"direction": "out", "type": trackType}).Add(float64(len(rtp.Payload)))
				})

			}
		} else if remoteTrack.Codec().MimeType == rtpVideoCodecVP8.MimeType {
			if trackID == "" || trackID != state.Call.ScreenTrackID {
				p.LogError("received unexpected video track", "trackID", trackID)
				return
			}

			p.LogDebug("received screen sharing track")
			call := p.getCall(userSession.channelID)
			if call == nil {
				p.LogError("call should not be nil")
				return
			}
			if s := call.getScreenSession(); s != nil {
				p.LogError("screenSession should be nil")
				return
			}
			call.setScreenSession(userSession)
			p.API.PublishWebSocketEvent(wsEventUserScreenOn, map[string]interface{}{
				"userID": userID,
			}, &model.WebsocketBroadcast{ChannelId: userSession.channelID})

			outScreenTrack, err := webrtc.NewTrackLocalStaticRTP(rtpVideoCodecVP8, "screen", model.NewId())
			if err != nil {
				p.LogError(err.Error())
				return
			}
			userSession.mut.Lock()
			userSession.outScreenTrack = outScreenTrack
			userSession.remoteScreenTrack = remoteTrack
			userSession.mut.Unlock()

			p.iterSessions(userSession.channelID, func(s *session) {
				if s.userID == userSession.userID {
					return
				}
				select {
				case s.tracksCh <- outScreenTrack:
				default:
					p.LogError("failed to send screen track, channel is full", "userID", userID, "trackUserID", s.userID)
				}
			})

			for {
				rtp, _, readErr := remoteTrack.ReadRTP()
				if readErr != nil {
					p.LogError(readErr.Error())
					return
				}
				p.metrics.RTPPacketCounters.With(prometheus.Labels{"direction": "in", "type": "screen"}).Inc()
				p.metrics.RTPPacketBytesCounters.With(prometheus.Labels{"direction": "in", "type": "screen"}).Add(float64(len(rtp.Payload)))
				if err := outScreenTrack.WriteRTP(rtp); err != nil && !errors.Is(err, io.ErrClosedPipe) {
					p.LogError(err.Error())
					return
				}

				// TODO: improve this.
				p.iterSessions(userSession.channelID, func(s *session) {
					if s.userID == userSession.userID {
						return
					}
					p.metrics.RTPPacketCounters.With(prometheus.Labels{"direction": "out", "type": "screen"}).Inc()
					p.metrics.RTPPacketBytesCounters.With(prometheus.Labels{"direction": "out", "type": "screen"}).Add(float64(len(rtp.Payload)))
				})
			}
		}
	})

	select {
	case msg, ok := <-userSession.signalInCh:
		if !ok {
			return
		}
		if err := p.handleSignaling(userSession, msg); err != nil {
			p.LogError(err.Error())
		}
	case <-time.After(signalingTimeout):
		p.LogError("timed out waiting for signaling message", "userID", userID)
	}

	go p.handleICE(userSession)
}

func (p *Plugin) handleTracks(us *session) {
	p.iterSessions(us.channelID, func(s *session) {
		if s.userID == us.userID {
			return
		}

		s.mut.RLock()
		outVoiceTrack := s.outVoiceTrack
		isEnabled := s.outVoiceTrackEnabled
		outScreenTrack := s.outScreenTrack
		outScreenAudioTrack := s.outScreenAudioTrack
		s.mut.RUnlock()
		if outVoiceTrack != nil {
			p.addTrack(us, outVoiceTrack, isEnabled)
		}
		if outScreenTrack != nil {
			p.addTrack(us, outScreenTrack, true)
		}
		if outScreenAudioTrack != nil {
			p.addTrack(us, outScreenAudioTrack, true)
		}
	})

	for {
		select {
		case track, ok := <-us.tracksCh:
			if !ok {
				return
			}
			p.addTrack(us, track, true)
		case msg, ok := <-us.signalInCh:
			if !ok {
				return
			}
			if err := p.handleSignaling(us, msg); err != nil {
				p.LogError(err.Error())
			}
		case muted, ok := <-us.trackEnableCh:
			if !ok {
				return
			}

			us.mut.RLock()
			track := us.outVoiceTrack
			us.mut.RUnlock()

			if track == nil {
				continue
			}

			us.mut.Lock()
			us.outVoiceTrackEnabled = !muted
			us.mut.Unlock()

			dummyTrack, err := webrtc.NewTrackLocalStaticRTP(rtpAudioCodec, "voice", model.NewId())
			if err != nil {
				p.LogError(err.Error())
				continue
			}

			p.iterSessions(us.channelID, func(s *session) {
				if s.userID == us.userID {
					return
				}

				s.mut.RLock()
				sender := s.rtpSendersMap[track]
				s.mut.RUnlock()

				var replacingTrack *webrtc.TrackLocalStaticRTP
				if muted {
					replacingTrack = dummyTrack
				} else {
					replacingTrack = track
				}

				if sender != nil {
					p.LogDebug("replacing track on sender")
					if err := sender.ReplaceTrack(replacingTrack); err != nil {
						p.LogError(err.Error())
					}
				}
			})
		case <-us.closeCh:
			return
		}
	}
}
