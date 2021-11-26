import Peer from 'simple-peer';

import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';

import {getWSConnectionURL} from './utils';
import {VOICE_CHANNEL_USER_CONNECTED} from './action_types';

export async function newClient(store, channelID: string, closeCb) {
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

        if (receiver) {
            receiver.destroy();
        }

        if (closeCb) {
            closeCb();
        }
    };

    const mute = () => {
        const audioTrack = stream.getAudioTracks()[0];
        audioTrack.enabled = false;
        if (ws) {
            ws.send(JSON.stringify({
                type: 'mute',
            }));
        }
    };

    const unmute = () => {
        const audioTrack = stream.getAudioTracks()[0];
        audioTrack.enabled = true;
        if (ws) {
            ws.send(JSON.stringify({
                type: 'unmute',
            }));
        }
    };

    ws.onerror = (err) => console.log(err);

    ws.onopen = () => {
        console.log('ws connected');

        peer = new Peer({initiator: true, stream, trickle: true});
        peer.on('connect', () => {
            console.log('connected!');
        });
        peer.on('signal', (data) => {
            console.log(data);
            if (data.type === 'offer') {
                console.log('sending offer');
                ws.send(JSON.stringify({
                    type: 'signal',
                    data,
                }));
            } else if (data.type === 'answer') {
                console.log('sending answer');
                ws.send(JSON.stringify({
                    type: 'signal',
                    data,
                }));
            } else if (data.type === 'candidate') {
                console.log('sending candidate');
                ws.send(JSON.stringify({
                    type: 'ice',
                    data,
                }));
            }
        });
        peer.on('error', (err) => console.log(err));
        ws.onmessage = ({data}) => {
            console.log('ws msg');

            const msg = JSON.parse(data);
            if (msg.type === 'answer') {
                peer.signal(data);
            } else if (msg.type === 'offer') {
                console.log('offer!');

                if (receiver) {
                    receiver.signal(data);
                    return;
                }

                receiver = new Peer({trickle: true});
                receiver.on('connect', () => console.log('receiver connected!'));
                receiver.on('error', (err) => console.log(err));
                receiver.on('signal', (data) => {
                    console.log(data);
                    if (data.type === 'offer') {
                        console.log('rcv sending offer');
                        ws.send(JSON.stringify({
                            type: 'signal',
                            data,
                        }));
                    } else if (data.type === 'answer') {
                        console.log('rcv sending answer');
                        ws.send(JSON.stringify({
                            type: 'signal',
                            data,
                        }));
                    }
                });
                receiver.signal(data);
                receiver.on('stream', (stream) => {
                    console.log('receiver stream');

                    streams.push(stream);

                    const audio = document.createElement('audio');
                    audio.srcObject = stream;
                    audio.controls = false;
                    audio.autoplay = true;
                    audio.style.display = 'none';

                    audio.onerror = (err) => console.log(err);

                    document.body.appendChild(audio);
                    receiver.on('close', () => {
                        console.log('receiver closed!');
                        audio.remove();
                    });
                });
            }
            console.log(data);
        };
    };

    return {
        disconnect,
        mute,
        unmute,
    };
}
