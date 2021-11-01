package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"

	"github.com/mattermost/mattermost-server/v6/model"

	"github.com/pion/rtcp"
	"github.com/pion/webrtc/v3"
	"github.com/prometheus/client_golang/prometheus"
)

var (
	stunServers   = []string{"stun:stun.l.google.com:19302", "stun:global.stun.twilio.com:3478"}
	rtpAudioCodec = webrtc.RTPCodecCapability{
		MimeType:     "audio/opus",
		ClockRate:    48000,
		Channels:     2,
		SDPFmtpLine:  "minptime=10;useinbandfec=1",
		RTCPFeedback: nil,
	}
	rtpVideoCodec = webrtc.RTPCodecCapability{
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

	us.wsOutCh <- sdp

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
	} else if t.Codec().MimeType == webrtc.MimeTypeVP8 {
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

	userSession.wsOutCh <- sdp

	var answer webrtc.SessionDescription
	msg, ok := <-userSession.wsInCh
	if !ok {
		return
	}
	p.LogDebug(string(msg))
	if err := json.Unmarshal(msg, &answer); err != nil {
		p.LogError(err.Error())
		return
	}

	if err := peerConn.SetRemoteDescription(answer); err != nil {
		p.LogError(err.Error())
		return
	}

	userSession.mut.Lock()
	userSession.rtpSendersMap[track] = sender
	userSession.mut.Unlock()
}

func (p *Plugin) initRTCConn(userID string) {
	peerConnConfig := webrtc.Configuration{
		ICEServers: []webrtc.ICEServer{
			{
				URLs: stunServers,
			},
		},
		SDPSemantics: webrtc.SDPSemanticsUnifiedPlanWithFallback,
	}

	var m webrtc.MediaEngine
	if err := m.RegisterCodec(webrtc.RTPCodecParameters{
		RTPCodecCapability: rtpAudioCodec,
		PayloadType:        111,
	}, webrtc.RTPCodecTypeAudio); err != nil {
		p.LogError(err.Error())
		return
	}
	if err := m.RegisterCodec(webrtc.RTPCodecParameters{
		RTPCodecCapability: rtpVideoCodec,
		PayloadType:        96,
	}, webrtc.RTPCodecTypeVideo); err != nil {
		p.LogError(err.Error())
		return
	}

	api := webrtc.NewAPI(webrtc.WithMediaEngine(&m), webrtc.WithSettingEngine(p.rtcSettingsEngine))
	peerConn, err := api.NewPeerConnection(peerConnConfig)
	if err != nil {
		p.LogError(err.Error())
		return
	}

	p.mut.RLock()
	userSession := p.sessions[userID]
	p.mut.RUnlock()

	go func() {
		for {
			select {
			case data, ok := <-userSession.iceCh:
				if !ok {
					return
				}

				var candidate webrtc.ICECandidateInit
				if err := json.Unmarshal(data, &candidate); err != nil {
					p.LogError(err.Error())
					continue
				}

				if candidate.Candidate == "" {
					p.LogDebug("received empty candidate")
					continue
				}

				if err := peerConn.AddICECandidate(candidate); err != nil {
					p.LogError(err.Error())
					continue
				}
			case <-userSession.closeCh:
				return
			}
		}
	}()

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
			userSession.wsOutCh <- msg
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

		if remoteTrack.Codec().MimeType == rtpAudioCodec.MimeType {
			outVoiceTrack, err := webrtc.NewTrackLocalStaticRTP(rtpAudioCodec, "voice", model.NewId())
			if err != nil {
				p.LogError(err.Error())
				return
			}

			userSession.mut.Lock()
			userSession.outVoiceTrack = outVoiceTrack
			userSession.outVoiceTrackEnabled = true
			userSession.mut.Unlock()

			p.iterSessions(userSession.channelID, func(s *session) {
				if s.userID == userSession.userID {
					return
				}
				s.tracksCh <- outVoiceTrack
			})

			for {
				rtp, _, readErr := remoteTrack.ReadRTP()
				if readErr != nil {
					p.LogError(readErr.Error())
					return
				}

				p.metrics.RTPPacketCounters.With(prometheus.Labels{"direction": "in", "type": "voice"}).Inc()
				p.metrics.RTPPacketBytesCounters.With(prometheus.Labels{"direction": "in", "type": "voice"}).Add(float64(len(rtp.Payload)))

				userSession.mut.RLock()
				isEnabled := userSession.outVoiceTrackEnabled
				userSession.mut.RUnlock()

				if !isEnabled {
					continue
				}

				if err := outVoiceTrack.WriteRTP(rtp); err != nil && !errors.Is(err, io.ErrClosedPipe) {
					p.LogError(err.Error())
					return
				}

				// TODO: improve this.
				p.iterSessions(userSession.channelID, func(s *session) {
					if s.userID == userSession.userID {
						return
					}
					p.metrics.RTPPacketCounters.With(prometheus.Labels{"direction": "out", "type": "voice"}).Inc()
					p.metrics.RTPPacketBytesCounters.With(prometheus.Labels{"direction": "out", "type": "voice"}).Add(float64(len(rtp.Payload)))
				})

			}
		} else if remoteTrack.Codec().MimeType == rtpVideoCodec.MimeType {
			// TODO: actually check if the userID matches the expected publisher.
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

			outScreenTrack, err := webrtc.NewTrackLocalStaticRTP(rtpVideoCodec, "screen", model.NewId())
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
				s.tracksCh <- outScreenTrack
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

	msg, ok := <-userSession.wsInCh
	if !ok {
		return
	}

	if err := p.handleSignaling(userSession, msg); err != nil {
		p.LogError(err.Error())
	}
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
		s.mut.RUnlock()
		if outVoiceTrack != nil {
			p.addTrack(us, outVoiceTrack, isEnabled)
		}
		if outScreenTrack != nil {
			p.addTrack(us, outScreenTrack, true)
		}
	})

	for {
		select {
		case track, ok := <-us.tracksCh:
			if !ok {
				return
			}
			p.addTrack(us, track, true)
		case msg, ok := <-us.wsInCh:
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
