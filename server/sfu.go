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
	stunServers = []string{"stun:stun.l.google.com:19302", "stun:global.stun.twilio.com:3478"}
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

	// FIXME: handle ICE trickle properly.
	<-webrtc.GatheringCompletePromise(peerConn)

	p.LogDebug("gather complete!")

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

func (p *Plugin) addTrack(userSession *session, track *webrtc.TrackLocalStaticRTP) {
	userSession.mut.RLock()
	peerConn := userSession.rtcConn
	userSession.mut.RUnlock()

	if sender, err := peerConn.AddTrack(track); err != nil {
		p.LogError(err.Error())
		return
	} else if track.Codec().MimeType == webrtc.MimeTypeVP8 {
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
	rtpAudioCodec := webrtc.RTPCodecCapability{
		MimeType:     "audio/opus",
		ClockRate:    48000,
		Channels:     2,
		SDPFmtpLine:  "minptime=10;useinbandfec=1",
		RTCPFeedback: nil,
	}
	if err := m.RegisterCodec(webrtc.RTPCodecParameters{
		RTPCodecCapability: rtpAudioCodec,
		PayloadType:        111,
	}, webrtc.RTPCodecTypeAudio); err != nil {
		p.LogError(err.Error())
		return
	}
	rtpVideoCodec := webrtc.RTPCodecCapability{
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
	if err := m.RegisterCodec(webrtc.RTPCodecParameters{
		RTPCodecCapability: rtpVideoCodec,
		PayloadType:        96,
	}, webrtc.RTPCodecTypeVideo); err != nil {
		p.LogError(err.Error())
		return
	}

	s := webrtc.SettingEngine{}
	if pRange := p.getConfiguration().ICEPortsRange; pRange.IsValid() == nil {
		p.LogDebug("Setting ICE ports range", "minPort", pRange.MinPort(), "maxPort", pRange.MaxPort())
		if err := s.SetEphemeralUDPPortRange(pRange.MinPort(), pRange.MaxPort()); err != nil {
			p.LogError(err.Error())
		}
	}

	api := webrtc.NewAPI(webrtc.WithMediaEngine(&m), webrtc.WithSettingEngine(s))

	peerConn, err := api.NewPeerConnection(peerConnConfig)
	if err != nil {
		p.LogError(err.Error())
		return
	}

	p.mut.RLock()
	userSession := p.sessions[userID]
	p.mut.RUnlock()

	userSession.mut.Lock()
	userSession.rtcConn = peerConn
	userSession.mut.Unlock()

	peerConn.OnConnectionStateChange(func(state webrtc.PeerConnectionState) {
		if state == webrtc.PeerConnectionStateConnected {
			p.LogDebug("connected!")
			p.metrics.RTCConnStateCounters.With(prometheus.Labels{"type": "connected"}).Inc()
		} else if state == webrtc.PeerConnectionStateDisconnected {
			p.LogDebug("peer connection disconnected")
			p.metrics.RTCConnStateCounters.With(prometheus.Labels{"type": "disconnected"}).Inc()
		} else if state == webrtc.PeerConnectionStateFailed {
			p.LogDebug("peer connection failed")
			p.metrics.RTCConnStateCounters.With(prometheus.Labels{"type": "failed"}).Inc()
		} else if state == webrtc.PeerConnectionStateClosed {
			p.LogDebug("peer connection closed")
			p.metrics.RTCConnStateCounters.With(prometheus.Labels{"type": "closed"}).Inc()
		}
	})

	peerConn.OnICEConnectionStateChange(func(state webrtc.ICEConnectionState) {
		if state == webrtc.ICEConnectionStateDisconnected {
			p.LogDebug("ice disconnected")
		} else if state == webrtc.ICEConnectionStateClosed {
			p.LogDebug("ice closed")
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
			userSession.mut.Unlock()

			p.mut.RLock()
			for id, s := range p.sessions {
				if id != userID && userSession.channelID == s.channelID {
					p.mut.RUnlock()
					s.tracksCh <- outVoiceTrack
					p.mut.RLock()
				}
			}
			p.mut.RUnlock()

			for {
				rtp, _, readErr := remoteTrack.ReadRTP()
				if readErr != nil {
					p.LogError(readErr.Error())
					return
				}

				p.metrics.RTPPacketCounters.With(prometheus.Labels{"direction": "in", "type": "voice"}).Inc()
				p.metrics.RTPPacketBytesCounters.With(prometheus.Labels{"direction": "in", "type": "voice"}).Add(float64(len(rtp.Payload)))

				if err := outVoiceTrack.WriteRTP(rtp); err != nil && !errors.Is(err, io.ErrClosedPipe) {
					p.LogError(err.Error())
					return
				}

				// TODO: improve this.
				p.mut.RLock()
				for id, s := range p.sessions {
					if id != userID && userSession.channelID == s.channelID {
						p.mut.RUnlock()
						p.metrics.RTPPacketCounters.With(prometheus.Labels{"direction": "out", "type": "voice"}).Inc()
						p.metrics.RTPPacketBytesCounters.With(prometheus.Labels{"direction": "out", "type": "voice"}).Add(float64(len(rtp.Payload)))
						p.mut.RLock()
					}
				}
				p.mut.RUnlock()
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

			p.mut.RLock()
			for id, s := range p.sessions {
				if id != userID && userSession.channelID == s.channelID {
					p.mut.RUnlock()
					s.tracksCh <- outScreenTrack
					p.mut.RLock()
				}
			}
			p.mut.RUnlock()

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
				p.mut.RLock()
				for id, s := range p.sessions {
					if id != userID && userSession.channelID == s.channelID {
						p.mut.RUnlock()
						p.metrics.RTPPacketCounters.With(prometheus.Labels{"direction": "out", "type": "screen"}).Inc()
						p.metrics.RTPPacketBytesCounters.With(prometheus.Labels{"direction": "out", "type": "screen"}).Add(float64(len(rtp.Payload)))
						p.mut.RLock()
					}
				}
				p.mut.RUnlock()
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
	p.mut.RLock()
	for id, session := range p.sessions {
		if id != us.userID && session.channelID == us.channelID {
			session.mut.RLock()
			outVoiceTrack := session.outVoiceTrack
			outScreenTrack := session.outScreenTrack
			session.mut.RUnlock()
			if outVoiceTrack != nil {
				p.mut.RUnlock()
				p.addTrack(us, outVoiceTrack)
				p.mut.RLock()
			}
			if outScreenTrack != nil {
				p.mut.RUnlock()
				p.addTrack(us, outScreenTrack)
				p.mut.RLock()
			}
		}
	}
	p.mut.RUnlock()

	for {
		select {
		case track, ok := <-us.tracksCh:
			if !ok {
				return
			}
			p.addTrack(us, track)
		case msg, ok := <-us.wsInCh:
			if !ok {
				return
			}
			if err := p.handleSignaling(us, msg); err != nil {
				p.LogError(err.Error())
			}
		case <-us.closeCh:
			return
		}
	}
}
