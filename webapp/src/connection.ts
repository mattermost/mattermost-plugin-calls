import Peer from 'simple-peer';

import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';

import {getWSConnectionURL} from './utils';
import {VOICE_CHANNEL_USER_CONNECTED} from './action_types';

import VoiceActivityDetector from './vad';

export async function newClient(channelID: string, closeCb) {
    let peer = null;
    let receiver = null;
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

        if (receiver) {
            receiver.destroy();
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
            if (data.type === 'offer') {
                ws.send(JSON.stringify({
                    type: 'signal',
                    data,
                }));
            } else if (data.type === 'answer') {
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
        ws.onmessage = ({data}) => {
            const msg = JSON.parse(data);
            if (msg.type === 'answer') {
                peer.signal(data);
            } else if (msg.type === 'offer') {
                if (receiver) {
                    receiver.signal(data);
                    return;
                }

                receiver = new Peer({trickle: true});
                receiver.on('error', (err) => console.log(err));
                receiver.on('signal', (signalData) => {
                    if (signalData.type === 'offer') {
                        ws.send(JSON.stringify({
                            type: 'signal',
                            data: signalData,
                        }));
                    } else if (signalData.type === 'answer') {
                        ws.send(JSON.stringify({
                            type: 'signal',
                            data: signalData,
                        }));
                    }
                });
                receiver.signal(data);
                receiver.on('stream', (remoteStream) => {
                    streams.push(remoteStream);

                    const audio = document.createElement('audio');
                    audio.srcObject = remoteStream;
                    audio.controls = false;
                    audio.autoplay = true;
                    audio.style.display = 'none';

                    audio.onerror = (err) => console.log(err);

                    document.body.appendChild(audio);
                    receiver.on('close', () => {
                        audio.remove();
                    });
                });
            }
        };
    };

    return {
        disconnect,
        mute,
        unmute,
    };
}
