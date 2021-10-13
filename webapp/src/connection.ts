import SimplePeer from 'simple-peer';

import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';

import {getWSConnectionURL, getScreenResolution} from './utils';

import VoiceActivityDetector from './vad';

export async function newClient(channelID: string, closeCb: () => void) {
    let peer: SimplePeer.Instance;
    let localScreenTrack: any;
    let currentAudioDeviceID: string;
    let voiceDetector: any;
    let voiceTrackAdded: boolean;
    const streams: MediaStream[] = [];

    const stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: true,
    });

    let audioDevices: { inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[]; };
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

    const initVAD = (inputStream: MediaStream) => {
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

    const setAudioInputDevice = async (device: MediaDeviceInfo) => {
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
        if (voiceTrackAdded) {
            peer.replaceTrack(audioTrack, newTrack, stream);
        } else {
            peer.addTrack(newTrack, stream);
        }
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

        if (ws) {
            ws.close();
        }

        if (peer) {
            peer.destroy();
        }

        if (voiceDetector) {
            voiceDetector.destroy();
        }
    };

    const mute = () => {
        if (voiceDetector) {
            voiceDetector.stop();
        }

        // @ts-ignore: we actually mean (and need) to pass null here
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
        let screenStream: MediaStream;
        if (!ws || !peer) {
            return null;
        }

        const resolution = getScreenResolution();
        console.log(resolution);

        const maxFrameRate = 15;
        const captureWidth = (resolution.width / 8) * 5;

        try {
            // browser
            screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    frameRate: maxFrameRate,
                    width: captureWidth,
                },
                audio: false,
            });
        } catch (err) {
            console.log(err);
            try {
                // electron
                screenStream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: {
                        mandatory: {
                            chromeMediaSource: 'desktop',
                            minWidth: captureWidth,
                            maxWidth: captureWidth,
                            maxFrameRate,
                        },
                    } as any,
                });
            } catch (err2) {
                console.log(err2);
                return null;
            }
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

    ws.onerror = (err) => {
        console.log(err);
        disconnect();
    };

    ws.onclose = () => {
        if (closeCb) {
            closeCb();
        }
    };

    ws.onopen = () => {
        peer = new SimplePeer({initiator: true, trickle: true});
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
        peer.on('error', (err) => {
            console.log(err);
            disconnect();
        });
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
                const videoEl = document.getElementById('screen-player') as HTMLVideoElement || null;
                if (videoEl) {
                    videoEl.srcObject = remoteStream;
                }
            }
        });

        ws.onmessage = ({data}) => {
            const msg = JSON.parse(data);
            if (msg.type !== 'ping') {
                console.log('ws', data);
            }
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
