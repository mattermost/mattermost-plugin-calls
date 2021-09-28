import Peer from 'simple-peer';

import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';

import {getWSConnectionURL} from './utils';
import {VOICE_CHANNEL_USER_CONNECTED} from './action_types';

import VoiceActivityDetector from './vad';

export async function newClient(channelID: string, closeCb) {
    let peer = null;
    const streams = [];

    const stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: true,
    });

    const audioTrack = stream.getAudioTracks()[0];
    audioTrack.enabled = false;
    streams.push(stream);

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
        throw new Error('AudioCtx unsupported');
    }
    const audioCtx = new AudioContext();
    const voiceDetector = new VoiceActivityDetector(audioCtx, stream);

    const ws = new WebSocket(getWSConnectionURL(channelID));

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
    };
}
