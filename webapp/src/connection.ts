import Peer from 'simple-peer';

import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';

import {getWSConnectionURL, getScreenResolution} from './utils';

import VoiceActivityDetector from './vad';

export async function newClient(channelID: string, closeCb) {
    let peer = null;
    let localScreenTrack;
    const streams = [];

    const stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: true,
    });

    const audioTrack = stream.getAudioTracks()[0];
    streams.push(stream);

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
        throw new Error('AudioCtx unsupported');
    }
    const audioCtx = new AudioContext();
    const voiceDetector = new VoiceActivityDetector(audioCtx, stream);

    voiceDetector.on('ready', () => {
        audioTrack.enabled = false;
        voiceDetector.on('start', () => {
            if (ws) {
                ws.send(JSON.stringify({
                    type: 'voice_on',
                }));
            }
        });
        voiceDetector.on('stop', () => {
            if (ws) {
                ws.send(JSON.stringify({
                    type: 'voice_off',
                }));
            }
        });
    });

    const ws = new WebSocket(getWSConnectionURL(channelID));

    const disconnect = () => {
        streams.forEach((s) => {
            s.getTracks().forEach((track) => {
                track.stop();
            });
        });

        ws.close();
        if (peer) {
            peer.destroy();
        }

        if (closeCb) {
            closeCb();
        }
    };

    const mute = () => {
        if (voiceDetector) {
            voiceDetector.stop();
        }

        audioTrack.enabled = false;
        if (ws) {
            ws.send(JSON.stringify({
                type: 'mute',
            }));
        }
    };

    const unmute = () => {
        if (voiceDetector) {
            voiceDetector.start();
        }

        audioTrack.enabled = true;
        if (ws) {
            ws.send(JSON.stringify({
                type: 'unmute',
            }));
        }
    };

    const shareScreen = async () => {
        let screenStream;
        if (!ws || !peer) {
            return screenStream;
        }

        try {
            const resolution = getScreenResolution();
            console.log(resolution);
            screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    frameRate: 10,
                    width: (resolution.width / 16) * 10,
                },
                audio: false,
            });
        } catch (err) {
            console.log(err);
            return screenStream;
        }

        streams.push(screenStream);
        const screenTrack = screenStream.getVideoTracks()[0];
        localScreenTrack = screenTrack;
        screenTrack.onended = () => {
            if (!ws || !peer) {
                return;
            }
            peer.removeStream(screenStream);
            ws.send(JSON.stringify({
                type: 'screen_off',
            }));
        };

        peer.addStream(screenStream);

        ws.send(JSON.stringify({
            type: 'screen_on',
        }));

        return screenStream;
    };

    const unshareScreen = () => {
        if (!ws) {
            return;
        }

        if (localScreenTrack) {
            localScreenTrack.stop();
            localScreenTrack = null;
        }

        ws.send(JSON.stringify({
            type: 'screen_off',
        }));
    };

    ws.onerror = (err) => console.log(err);

    ws.onopen = () => {
        peer = new Peer({initiator: true, stream, trickle: true});
        peer.on('signal', (data) => {
            console.log('signal', data);
            if (data.type === 'offer' || data.type === 'answer') {
                ws.send(JSON.stringify({
                    type: 'signal',
                    data,
                }));
            } else if (data.type === 'candidate') {
                ws.send(JSON.stringify({
                    type: 'ice',
                    data,
                }));
            }
        });
        peer.on('error', (err) => console.log(err));
        peer.on('stream', (remoteStream) => {
            console.log('new remote stream received');
            console.log(remoteStream);

            streams.push(remoteStream);

            if (remoteStream.getAudioTracks().length > 0) {
                const voiceTrack = remoteStream.getAudioTracks()[0];
                console.log(voiceTrack);
                const audioEl = document.createElement('audio');
                audioEl.srcObject = remoteStream;
                audioEl.controls = false;
                audioEl.autoplay = true;
                audioEl.style.display = 'none';

                audioEl.onerror = (err) => console.log(err);

                document.body.appendChild(audioEl);

                voiceTrack.onended = () => {
                    console.log('voice track ended');
                    audioEl.remove();
                };
            } else if (remoteStream.getVideoTracks().length > 0) {
                console.log('video track!');
                const videoEl = document.getElementById('screen-player');
                videoEl.srcObject = remoteStream;
            }
        });

        ws.onmessage = ({data}) => {
            console.log('ws', data);
            const msg = JSON.parse(data);
            if (msg.type === 'answer' || msg.type === 'offer') {
                peer.signal(data);
            }
        };
    };

    return {
        disconnect,
        mute,
        unmute,
        shareScreen,
        unshareScreen,
    };
}
