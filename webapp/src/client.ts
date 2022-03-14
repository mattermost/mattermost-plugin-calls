import {EventEmitter} from 'events';
import SimplePeer from 'simple-peer';
import axios from 'axios';

// @ts-ignore
import {deflate} from 'pako/lib/deflate.js';

import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';

import {getPluginWSConnectionURL, getScreenStream, getPluginPath, setSDPMaxVideoBW} from './utils';

import WebSocketClient from './websocket';
import VoiceActivityDetector from './vad';

export default class CallsClient extends EventEmitter {
    private peer: SimplePeer.Instance | null;
    private ws: WebSocketClient | null;
    private localScreenTrack: any;
    private remoteScreenTrack: any;
    public currentAudioDevice: MediaDeviceInfo | null = null;
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
        this.currentAudioDevice = null;
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
            if (this.ws && this.audioTrack?.enabled) {
                this.ws.send('voice_on');
            }
        });
        this.voiceDetector.on('stop', () => {
            if (this.ws) {
                this.ws.send('voice_off');
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
        await this.updateDevices();
        navigator.mediaDevices.ondevicechange = this.updateDevices;

        const audioOptions = {
            autoGainControl: true,
            echoCancellation: true,
            noiseSuppression: true,
        } as any;

        const defaultID = window.localStorage.getItem('calls_default_audio_input');
        if (defaultID) {
            const devices = this.audioDevices.inputs.filter((dev) => {
                return dev.deviceId === defaultID;
            });
            console.log(devices);
            if (devices && devices.length === 1) {
                console.log(`found default audio input device to use: ${devices[0].label}`);
                audioOptions.deviceId = {
                    exact: defaultID,
                };
                this.currentAudioDevice = devices[0];
            } else {
                console.log('audio input device not found');
                window.localStorage.removeItem('calls_default_audio_input');
            }
        }

        this.stream = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: audioOptions,
        });

        // updating the devices again cause some browsers (e.g Firefox) will
        // return empty labels unless permissions were previously granted.
        await this.updateDevices();

        this.audioTrack = this.stream.getAudioTracks()[0];
        this.streams.push(this.stream);

        this.initVAD(this.stream);
        this.audioTrack.enabled = false;

        const ws = new WebSocketClient();
        this.ws = ws;

        ws.on('error', (err) => {
            console.log('ws error', err);
            this.disconnect();
        });

        ws.on('close', (code?: number) => {
            console.log(`ws close: ${code}`);
            this.ws = null;
            this.disconnect();
        });

        ws.on('open', (connID: string) => {
            console.log('ws open, sending join msg');
            ws.send('join', {
                channelID,
            });
        });

        ws.on('join', async () => {
            console.log('join ack received, initializing connection');
            let config;
            try {
                const resp = await axios.get(`${getPluginPath()}/config`);
                config = resp.data;
            } catch (err) {
                console.log(err);
                this.ws?.close();
                return;
            }

            const peer = new SimplePeer({
                initiator: true,
                trickle: true,
                config: {iceServers: []},
            }) as SimplePeer.Instance;

            this.peer = peer;
            peer.on('signal', (data) => {
                console.log('signal', data);
                if (data.type === 'offer' || data.type === 'answer') {
                    if (!ws) {
                        return;
                    }
                    ws.send('sdp', {
                        data: deflate(JSON.stringify(data)),
                    }, true);
                } else if (data.type === 'candidate') {
                    if (!ws) {
                        return;
                    }
                    ws.send('ice', {
                        data: JSON.stringify(data.candidate),
                    });
                }
            });
            peer.on('error', (err) => {
                console.log('peer error', err);
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
                    this.remoteScreenTrack = remoteStream.getVideoTracks()[0];
                }
            });
            peer.on('connect', () => {
                console.log('rtc connected');
                this.emit('connect');
            });
        });

        ws.on('message', ({data}) => {
            const msg = JSON.parse(data);
            if (!msg) {
                return;
            }
            if (msg.type !== 'ping') {
                console.log('ws', data);
            }
            if (msg.type === 'answer' || msg.type === 'offer' || msg.type === 'candidate') {
                if (msg.type === 'answer' || msg.type === 'offer') {
                    const sdp = setSDPMaxVideoBW(msg.sdp, 1000);
                    if (sdp !== msg.sdp) {
                        msg.sdp = sdp;
                        data = JSON.stringify(msg);
                    }
                }
                if (this.peer) {
                    this.peer.signal(data);
                }
            }
        });

        return this;
    }

    public destroy() {
        this.removeAllListeners('close');
        this.removeAllListeners('connect');
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

        window.localStorage.setItem('calls_default_audio_input', device.deviceId);
        this.currentAudioDevice = device;

        const isEnabled = this.audioTrack.enabled;
        this.voiceDetector.stop();
        this.voiceDetector.destroy();
        this.audioTrack.stop();
        const newStream = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: {
                deviceId: {
                    exact: device.deviceId,
                },
                autoGainControl: true,
                echoCancellation: true,
                noiseSuppression: true,
            } as any,
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
            console.log('disconnect');
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
            this.ws.send('mute');
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
            this.ws.send('unmute');
        }
    }

    public getLocalScreenStream(): MediaStream|null {
        if (!this.localScreenTrack) {
            return null;
        }
        return new MediaStream([this.localScreenTrack]);
    }

    public getRemoteScreenStream(): MediaStream|null {
        if (!this.remoteScreenTrack) {
            return null;
        }
        return new MediaStream([this.remoteScreenTrack]);
    }

    public setScreenStream(screenStream: MediaStream) {
        if (!this.ws || !this.peer || this.localScreenTrack || !screenStream) {
            return;
        }

        const screenTrack = screenStream.getVideoTracks()[0];
        this.localScreenTrack = screenTrack;
        screenStream = new MediaStream([screenTrack]);
        this.streams.push(screenStream);

        screenTrack.onended = () => {
            this.localScreenTrack = null;

            if (!this.ws || !this.peer) {
                return;
            }

            // @ts-ignore: we actually mean to pass null here
            this.peer.replaceTrack(screenTrack, null, screenStream);
            this.ws.send('screen_off');
        };

        this.peer.addStream(screenStream);

        this.ws.send('screen_on');
    }

    public async shareScreen(sourceID?: string) {
        if (!this.ws || !this.peer) {
            return null;
        }

        const screenStream = await getScreenStream(sourceID);
        if (screenStream === null) {
            return null;
        }

        this.setScreenStream(screenStream);

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
            this.ws.send('raise_hand');
        }
        this.isHandRaised = true;
    }

    public unraiseHand() {
        if (this.ws) {
            this.ws.send('unraise_hand');
        }
        this.isHandRaised = false;
    }
}
