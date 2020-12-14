package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"

	"github.com/mattermost/mattermost-server/v5/model"

	"github.com/pion/webrtc/v3"
)

var (
	stunServers = []string{"stun:stun.l.google.com:19302", "stun:global.stun.twilio.com:3478"}
)

func (p *Plugin) newConnWithTracks(userSession *session, api *webrtc.API, tracks []*webrtc.TrackLocalStaticRTP) *webrtc.PeerConnection {
	peerConnConfig := webrtc.Configuration{
		ICEServers: []webrtc.ICEServer{
			{
				URLs: stunServers,
			},
		},
	}

	peerConn, err := api.NewPeerConnection(peerConnConfig)
	if err != nil {
		p.API.LogError(err.Error())
		return nil
	}

	for _, track := range tracks {
		if _, err := peerConn.AddTrack(track); err != nil {
			p.API.LogError(err.Error())
			return nil
		}
	}

	offer, err := peerConn.CreateOffer(nil)
	if err != nil {
		p.API.LogError(err.Error())
		return nil
	}

	err = peerConn.SetLocalDescription(offer)
	if err != nil {
		p.API.LogError(err.Error())
		return nil
	}

	// FIXME: handle ICE trickle properly.
	<-webrtc.GatheringCompletePromise(peerConn)

	sdp, err := json.Marshal(peerConn.LocalDescription())
	if err != nil {
		p.API.LogError(err.Error())
		return nil
	}

	userSession.wsOutCh <- sdp

	var answer webrtc.SessionDescription
	msg, ok := <-userSession.wsInCh
	if !ok {
		return nil
	}

	p.API.LogInfo(string(msg))
	if err := json.Unmarshal(msg, &answer); err != nil {
		p.API.LogError(err.Error())
		return nil
	}

	if err := peerConn.SetRemoteDescription(answer); err != nil {
		p.API.LogError(err.Error())
		return nil
	}

	return peerConn
}

func (p *Plugin) addTrack(userSession *session, track *webrtc.TrackLocalStaticRTP) {
	userSession.mut.RLock()
	peerConn := userSession.outConn
	userSession.mut.RUnlock()

	if _, err := peerConn.AddTrack(track); err != nil {
		p.API.LogError(err.Error())
		return
	}

	offer, err := peerConn.CreateOffer(nil)
	if err != nil {
		p.API.LogError(err.Error())
		return
	}

	err = peerConn.SetLocalDescription(offer)
	if err != nil {
		p.API.LogError(err.Error())
		return
	}

	sdp, err := json.Marshal(peerConn.LocalDescription())
	if err != nil {
		p.API.LogError(err.Error())
		return
	}

	userSession.wsOutCh <- sdp

	var answer webrtc.SessionDescription
	msg, ok := <-userSession.wsInCh
	if !ok {
		return
	}
	p.API.LogInfo(string(msg))
	if err := json.Unmarshal(msg, &answer); err != nil {
		p.API.LogError(err.Error())
		return
	}

	if err := peerConn.SetRemoteDescription(answer); err != nil {
		p.API.LogError(err.Error())
		return
	}
}

func (p *Plugin) getOtherTracks(userID, channelID string) []*webrtc.TrackLocalStaticRTP {
	var tracks []*webrtc.TrackLocalStaticRTP
	p.mut.RLock()
	defer p.mut.RUnlock()
	for id, session := range p.sessions {
		if id != userID && session.channelID == channelID {
			session.mut.RLock()
			if session.outTrack != nil {
				tracks = append(tracks, session.outTrack)
			}
			session.mut.RUnlock()
		}
	}
	return tracks
}

func (p *Plugin) handleTracks(userID string) {
	peerConnConfig := webrtc.Configuration{
		ICEServers: []webrtc.ICEServer{
			{
				URLs: stunServers,
			},
		},
	}

	var m webrtc.MediaEngine
	rtpCodec := webrtc.RTPCodecCapability{MimeType: "audio/opus", ClockRate: 48000, Channels: 2, SDPFmtpLine: "", RTCPFeedback: nil}
	if err := m.RegisterCodec(webrtc.RTPCodecParameters{
		RTPCodecCapability: rtpCodec,
		PayloadType:        111,
	}, webrtc.RTPCodecTypeAudio); err != nil {
		p.API.LogError(err.Error())
		return
	}

	api := webrtc.NewAPI(webrtc.WithMediaEngine(&m))

	peerConn, err := api.NewPeerConnection(peerConnConfig)
	if err != nil {
		p.API.LogError(err.Error())
		return
	}

	outputTrack, err := webrtc.NewTrackLocalStaticRTP(rtpCodec, "audio", model.NewId())
	if err != nil {
		p.API.LogError(err.Error())
		return
	}

	p.mut.RLock()
	userSession := p.sessions[userID]
	p.mut.RUnlock()

	userSession.outTrack = outputTrack

	p.mut.RLock()
	for id, s := range p.sessions {
		if id != userID && userSession.channelID == s.channelID {
			p.mut.RUnlock()
			s.mut.RLock()
			outConn := s.outConn
			s.mut.RUnlock()
			if outConn == nil {
				outConn = p.newConnWithTracks(s, api, p.getOtherTracks(id, s.channelID))
				s.mut.Lock()
				s.outConn = outConn
				s.mut.Unlock()
			} else {
				p.addTrack(s, outputTrack)
			}
			p.mut.RLock()
		}
	}
	p.mut.RUnlock()

	peerConn.OnConnectionStateChange(func(state webrtc.PeerConnectionState) {
		if state == webrtc.PeerConnectionStateConnected {
			p.API.LogInfo("connected!")
		} else if state == webrtc.PeerConnectionStateDisconnected {
			p.API.LogInfo("peer connection disconnected")
		} else if state == webrtc.PeerConnectionStateClosed {
			p.API.LogInfo("peer connection closed")
		}
	})

	peerConn.OnICEConnectionStateChange(func(state webrtc.ICEConnectionState) {
		if state == webrtc.ICEConnectionStateDisconnected {
			p.API.LogInfo("ice disconnected")
		} else if state == webrtc.ICEConnectionStateClosed {
			p.API.LogInfo("ice closed")
		}
	})

	peerConn.OnTrack(func(remoteTrack *webrtc.TrackRemote, receiver *webrtc.RTPReceiver) {
		p.API.LogInfo("Got remote track!!!")
		p.API.LogInfo(fmt.Sprintf("%+v", remoteTrack.Codec().RTPCodecCapability))
		p.API.LogInfo(fmt.Sprintf("Track has started, of type %d: %s", remoteTrack.PayloadType(), remoteTrack.Codec().MimeType))

		for {
			rtp, readErr := remoteTrack.ReadRTP()
			if readErr != nil {
				p.API.LogError(readErr.Error())
				return
			}
			if err := outputTrack.WriteRTP(rtp); err != nil && !errors.Is(err, io.ErrClosedPipe) {
				p.API.LogError(err.Error())
				return
			}
		}
	})

	var offer webrtc.SessionDescription
	msg, ok := <-userSession.wsInCh
	if !ok {
		return
	}
	p.API.LogInfo(string(msg))
	if err := json.Unmarshal(msg, &offer); err != nil {
		p.API.LogError(err.Error())
		return
	}

	if err := peerConn.SetRemoteDescription(offer); err != nil {
		p.API.LogError(err.Error())
		return
	}

	answer, err := peerConn.CreateAnswer(nil)
	if err != nil {
		p.API.LogError(err.Error())
		return
	}

	if err := peerConn.SetLocalDescription(answer); err != nil {
		p.API.LogError(err.Error())
		return
	}

	// FIXME: handle ICE trickle properly.
	<-webrtc.GatheringCompletePromise(peerConn)

	p.API.LogInfo("gather complete!")

	sdp, err := json.Marshal(peerConn.LocalDescription())
	if err != nil {
		p.API.LogError(err.Error())
		return
	}

	p.API.LogInfo(string(sdp))

	userSession.wsOutCh <- sdp

	tracks := p.getOtherTracks(userID, userSession.channelID)
	if len(tracks) > 0 {
		outConn := p.newConnWithTracks(userSession, api, tracks)
		userSession.mut.Lock()
		userSession.outConn = outConn
		userSession.mut.Unlock()
	}
}
