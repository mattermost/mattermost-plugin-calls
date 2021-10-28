import {EventEmitter} from 'events';
import SimplePeer from 'simple-peer';

import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';

import {getWSConnectionURL, getScreenResolution} from './utils';

import VoiceActivityDetector from './vad';

export default class CallsClient extends EventEmitter {
    private peer: SimplePeer.Instance | null;
    private ws: WebSocket | null;
    private localScreenTrack: any;
    private currentAudioDeviceID: string;
    private voiceDetector: any;
    private voiceTrackAdded: boolean;
    private streams: MediaStream[];
    private stream: MediaStream | null;
    private audioDevices: { inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[]; };
    private audioTrack: MediaStreamTrack | null;
    public isHandRaised: boolean;

    constructor() {
        super();
        this.ws = null;
        this.peer = null;
        this.audioTrack = null;
        this.currentAudioDeviceID = '';
        this.voiceTrackAdded = false;
        this.streams = [];
        this.stream = null;
        this.audioDevices = {inputs: [], outputs: []};
        this.isHandRaised = false;
    }

    private initVAD(inputStream: MediaStream) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) {
            throw new Error('AudioCtx unsupported');
        }
        this.voiceDetector = new VoiceActivityDetector(new AudioContext(), inputStream.clone());
        this.voiceDetector.on('start', () => {
            if (this.ws?.readyState === WebSocket.OPEN && this.audioTrack?.enabled) {
                this.ws.send(JSON.stringify({
                    type: 'voice_on',
                }));
            }
        });
        this.voiceDetector.on('stop', () => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    type: 'voice_off',
                }));
            }
        });
    }

    private async updateDevices() {
        const devices = await navigator.mediaDevices.enumerateDevices();
        this.audioDevices = {
            inputs: devices.filter((device) => device.kind === 'audioinput'),
            outputs: devices.filter((device) => device.kind === 'audiooutput'),
        };
    }

    public async init(channelID: string) {
        this.stream = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: true,
        });

        this.updateDevices();
        navigator.mediaDevices.ondevicechange = this.updateDevices;

        this.audioTrack = this.stream.getAudioTracks()[0];
        this.streams.push(this.stream);

        this.initVAD(this.stream);
        this.audioTrack.enabled = false;

        const ws = new WebSocket(getWSConnectionURL(channelID));
        this.ws = ws;

        ws.onerror = (err) => {
            console.log(err);
            this.ws = null;
            this.disconnect();
        };

        ws.onclose = () => {
            this.ws = null;
            this.disconnect();
        };

        ws.onopen = () => {
            const peer = new SimplePeer({initiator: true, trickle: true}) as SimplePeer.Instance;
            this.peer = peer;
            peer.on('signal', (data) => {
                console.log('signal', data);
                if (data.type === 'offer' || data.type === 'answer') {
                    if (!ws) {
                        return;
                    }
                    ws.send(JSON.stringify({
                        type: 'signal',
                        data,
                    }));
                } else if (data.type === 'candidate') {
                    if (!ws) {
                        return;
                    }
                    ws.send(JSON.stringify({
                        type: 'ice',
                        data: data.candidate,
                    }));
                }
            });
            peer.on('error', (err) => {
                console.log(err);
                this.disconnect();
            });
            peer.on('stream', (remoteStream) => {
                console.log('new remote stream received');
                console.log(remoteStream);

                this.streams.push(remoteStream);

                if (remoteStream.getAudioTracks().length > 0) {
                    this.emit('remoteVoiceStream', remoteStream);
                } else if (remoteStream.getVideoTracks().length > 0) {
                    this.emit('remoteScreenStream', remoteStream);
                }
            });
        };

        ws.onmessage = ({data}) => {
            const msg = JSON.parse(data);
            if (msg.type !== 'ping') {
                console.log('ws', data);
            }
            if (msg.type === 'answer' || msg.type === 'offer' || msg.type === 'candidate') {
                if (this.peer) {
                    this.peer.signal(data);
                }
            }
        };

        return this;
    }

    public destroy() {
        this.removeAllListeners('close');
        this.removeAllListeners('remoteVoiceStream');
        this.removeAllListeners('remoteScreenStream');
    }

    public getAudioDevices() {
        return this.audioDevices;
    }

    public async setAudioInputDevice(device: MediaDeviceInfo) {
        if (!this.peer || !this.audioTrack || !this.stream) {
            return;
        }

        const isEnabled = this.audioTrack.enabled;
        this.voiceDetector.stop();
        this.voiceDetector.destroy();
        this.audioTrack.stop();
        const newStream = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: {deviceId: {exact: device.deviceId}},
        });
        this.streams.push(newStream);
        const newTrack = newStream.getAudioTracks()[0];
        this.stream.removeTrack(this.audioTrack);
        this.stream.addTrack(newTrack);
        this.initVAD(this.stream);
        if (isEnabled) {
            this.voiceDetector.on('ready', () => this.voiceDetector.start());
        }
        newTrack.enabled = isEnabled;
        if (isEnabled) {
            if (this.voiceTrackAdded) {
                this.peer.replaceTrack(this.audioTrack, newTrack, this.stream);
            } else {
                this.peer.addTrack(newTrack, this.stream);
            }
        } else {
            this.voiceTrackAdded = false;
        }
        this.audioTrack = newTrack;
    }

    public disconnect() {
        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }

        if (this.voiceDetector) {
            this.voiceDetector.destroy();
            this.voiceDetector = null;
        }

        this.streams.forEach((s) => {
            s.getTracks().forEach((track) => {
                track.stop();
                track.dispatchEvent(new Event('ended'));
            });
        });

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this.emit('close');
    }

    public isMuted() {
        if (!this.audioTrack) {
            return true;
        }
        return !this.audioTrack.enabled;
    }

    public mute() {
        if (!this.peer || !this.audioTrack || !this.stream) {
            return;
        }

        if (this.voiceDetector) {
            this.voiceDetector.stop();
        }

        // @ts-ignore: we actually mean (and need) to pass null here
        this.peer.replaceTrack(this.audioTrack, null, this.stream);
        this.audioTrack.enabled = false;

        if (this.ws) {
            this.ws.send(JSON.stringify({
                type: 'mute',
            }));
        }
    }

    public unmute() {
        if (!this.peer || !this.audioTrack || !this.stream) {
            return;
        }

        if (this.voiceDetector) {
            this.voiceDetector.start();
        }

        if (this.voiceTrackAdded) {
            this.peer.replaceTrack(this.audioTrack, this.audioTrack, this.stream);
        } else {
            this.peer.addTrack(this.audioTrack, this.stream);
            this.voiceTrackAdded = true;
        }
        this.audioTrack.enabled = true;
        if (this.ws) {
            this.ws.send(JSON.stringify({
                type: 'unmute',
            }));
        }
    }

    public async shareScreen() {
        let screenStream: MediaStream;
        if (!this.ws || !this.peer) {
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

        this.streams.push(screenStream);
        const screenTrack = screenStream.getVideoTracks()[0];
        this.localScreenTrack = screenTrack;
        screenTrack.onended = () => {
            if (!this.ws || !this.peer) {
                return;
            }

            // @ts-ignore: we actually mean to pass null here
            this.peer.replaceTrack(screenTrack, null, screenStream);
            this.ws.send(JSON.stringify({
                type: 'screen_off',
            }));
        };

        this.peer.addStream(screenStream);

        this.ws.send(JSON.stringify({
            type: 'screen_on',
        }));

        return screenStream;
    }

    public unshareScreen() {
        if (!this.ws || !this.localScreenTrack) {
            return;
        }

        this.localScreenTrack.stop();
        this.localScreenTrack.dispatchEvent(new Event('ended'));
        this.localScreenTrack = null;
    }

    public raiseHand() {
        if (this.ws) {
            this.ws.send(JSON.stringify({
                type: 'raise_hand',
            }));
        }
        this.isHandRaised = true;
    }

    public unraiseHand() {
        if (this.ws) {
            this.ws.send(JSON.stringify({
                type: 'unraise_hand',
            }));
        }
        this.isHandRaised = false;
    }
}
