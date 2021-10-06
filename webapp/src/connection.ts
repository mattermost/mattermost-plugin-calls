import Peer from 'simple-peer';

import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';

import {getWSConnectionURL, getScreenResolution} from './utils';

import VoiceActivityDetector from './vad';

export async function newClient(channelID: string, closeCb) {
    let peer;
    let localScreenTrack;
    let currentAudioDeviceID;
    let voiceDetector;
    let voiceTrackAdded;
    const streams = [];

    const stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: true,
    });

    let audioDevices;
    const updateDevices = async () => {
        const devices = await navigator.mediaDevices.enumerateDevices();
        audioDevices = {
            inputs: devices.filter((device) => device.kind === 'audioinput'),
            outputs: devices.filter((device) => device.kind === 'audiooutput'),
        };
    };
    updateDevices();
    navigator.mediaDevices.ondevicechange = updateDevices;

    let audioTrack = stream.getAudioTracks()[0];
    streams.push(stream);

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
        throw new Error('AudioCtx unsupported');
    }
    const audioCtx = new AudioContext();

    const initVAD = (inputStream) => {
        voiceDetector = new VoiceActivityDetector(audioCtx, inputStream.clone());
        voiceDetector.on('start', () => {
            if (ws && ws.readyState === WebSocket.OPEN && audioTrack.enabled) {
                ws.send(JSON.stringify({
                    type: 'voice_on',
                }));
            }
        });
        voiceDetector.on('stop', () => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'voice_off',
                }));
            }
        });
    };

    initVAD(stream);
    audioTrack.enabled = false;

    const ws = new WebSocket(getWSConnectionURL(channelID));

    const setAudioInputDevice = async (device) => {
        const isEnabled = audioTrack.enabled;
        voiceDetector.stop();
        voiceDetector.destroy();
        audioTrack.stop();
        const newStream = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: {deviceId: {exact: device.deviceId}},
        });
        streams.push(newStream);
        const newTrack = newStream.getAudioTracks()[0];
        stream.removeTrack(audioTrack);
        stream.addTrack(newTrack);
        initVAD(stream);
        if (isEnabled) {
            voiceDetector.on('ready', () => voiceDetector.start());
        }
        newTrack.enabled = isEnabled;
        peer.replaceTrack(audioTrack, newTrack, stream);
        audioTrack = newTrack;
    };

    const getAudioDevices = () => {
        return audioDevices;
    };

    const disconnect = () => {
        streams.forEach((s) => {
            s.getTracks().forEach((track) => {
                track.stop();
                track.dispatchEvent(new Event('ended'));
            });
        });

        ws.close();
        if (peer) {
            peer.destroy();
        }

        if (voiceDetector) {
            voiceDetector.destroy();
        }

        if (closeCb) {
            closeCb();
        }
    };

    const mute = () => {
        if (voiceDetector) {
            voiceDetector.stop();
        }

        peer.replaceTrack(audioTrack, null, stream);
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

        if (voiceTrackAdded) {
            peer.replaceTrack(audioTrack, audioTrack, stream);
        } else {
            peer.addTrack(audioTrack, stream);
            voiceTrackAdded = true;
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
                    frameRate: 15,
                    width: (resolution.width / 8) * 5,
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
        peer = new Peer({initiator: true, trickle: true});
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
        getAudioDevices,
        setAudioInputDevice,
    };
}
