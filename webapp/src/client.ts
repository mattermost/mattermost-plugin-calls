import {EventEmitter} from 'events';
import SimplePeer from 'simple-peer';

// @ts-ignore
import {deflate} from 'pako/lib/deflate.js';

import {RTCStats} from 'src/types/types';

import {getScreenStream, setSDPMaxVideoBW} from './utils';
import {logErr, logDebug} from './log';
import WebSocketClient from './websocket';
import VoiceActivityDetector from './vad';

import {parseRTCStats} from './rtc_stats';

export default class CallsClient extends EventEmitter {
    public channelID: string;
    private readonly iceServers: string[];
    private peer: SimplePeer.Instance | null;
    private ws: WebSocketClient | null;
    private localScreenTrack: any;
    private remoteScreenTrack: any;
    public currentAudioInputDevice: MediaDeviceInfo | null = null;
    public currentAudioOutputDevice: MediaDeviceInfo | null = null;
    private voiceDetector: any;
    private voiceTrackAdded: boolean;
    private streams: MediaStream[];
    private stream: MediaStream | null;
    private audioDevices: { inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[]; };
    private audioTrack: MediaStreamTrack | null;
    public isHandRaised: boolean;

    constructor(iceServers: string[]) {
        super();
        this.ws = null;
        this.peer = null;
        this.audioTrack = null;
        this.currentAudioInputDevice = null;
        this.currentAudioInputDevice = null;
        this.voiceTrackAdded = false;
        this.streams = [];
        this.stream = null;
        this.audioDevices = {inputs: [], outputs: []};
        this.isHandRaised = false;
        this.channelID = '';
        this.iceServers = iceServers;
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

    public async init(channelID: string, title?: string) {
        this.channelID = channelID;
        await this.updateDevices();
        navigator.mediaDevices.ondevicechange = this.updateDevices;

        const audioOptions = {
            autoGainControl: true,
            echoCancellation: true,
            noiseSuppression: true,
        } as any;

        const defaultInputID = window.localStorage.getItem('calls_default_audio_input');
        const defaultOutputID = window.localStorage.getItem('calls_default_audio_output');
        if (defaultInputID) {
            const devices = this.audioDevices.inputs.filter((dev) => {
                return dev.deviceId === defaultInputID;
            });

            if (devices && devices.length === 1) {
                logDebug(`found default audio input device to use: ${devices[0].label}`);
                audioOptions.deviceId = {
                    exact: defaultInputID,
                };
                this.currentAudioInputDevice = devices[0];
            } else {
                logDebug('audio input device not found');
                window.localStorage.removeItem('calls_default_audio_input');
            }
        }

        if (defaultOutputID) {
            const devices = this.audioDevices.outputs.filter((dev) => {
                return dev.deviceId === defaultOutputID;
            });

            if (devices && devices.length === 1) {
                logDebug(`found default audio output device to use: ${devices[0].label}`);
                this.currentAudioOutputDevice = devices[0];
            } else {
                logDebug('audio output device not found');
                window.localStorage.removeItem('calls_default_audio_output');
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

        ws.on('error', (ev) => {
            logErr('ws error', ev);
            this.disconnect();
        });

        ws.on('close', (code?: number) => {
            logDebug(`ws close: ${code}`);
            this.ws = null;
            this.disconnect();
        });

        ws.on('open', (connID: string) => {
            logDebug('ws open, sending join msg');
            ws.send('join', {
                channelID,
                title,
            });
        });

        ws.on('join', async () => {
            logDebug('join ack received, initializing connection');
            const iceServers = this.iceServers?.length > 0 ? [{urls: this.iceServers}] : [];
            const peer = new SimplePeer({
                initiator: true,
                trickle: true,
                config: {iceServers},
            }) as SimplePeer.Instance;

            this.peer = peer;
            peer.on('signal', (data) => {
                logDebug(`local signal: ${JSON.stringify(data)}`);
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
                logErr('peer error', err);
                this.disconnect();
            });
            peer.on('stream', (remoteStream) => {
                logDebug('new remote stream received', remoteStream);
                logDebug('remote tracks', remoteStream.getTracks());

                this.streams.push(remoteStream);

                if (remoteStream.getAudioTracks().length > 0) {
                    this.emit('remoteVoiceStream', remoteStream);
                } else if (remoteStream.getVideoTracks().length > 0) {
                    this.emit('remoteScreenStream', remoteStream);
                    this.remoteScreenTrack = remoteStream.getVideoTracks()[0];
                }
            });
            peer.on('connect', () => {
                logDebug('rtc connected');
                this.emit('connect');
            });
        });

        ws.on('message', ({data}) => {
            const msg = JSON.parse(data);
            if (!msg) {
                return;
            }
            if (msg.type !== 'ping') {
                logDebug('remote signal', data);
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
        this.currentAudioInputDevice = device;

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

    public async setAudioOutputDevice(device: MediaDeviceInfo) {
        if (!this.peer) {
            return;
        }
        window.localStorage.setItem('calls_default_audio_output', device.deviceId);
        this.currentAudioOutputDevice = device;
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
            logDebug('disconnect');
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

        const screenAudioTrack = screenStream.getAudioTracks()[0];
        if (screenAudioTrack) {
            screenStream = new MediaStream([screenTrack, screenAudioTrack]);
        } else {
            screenStream = new MediaStream([screenTrack]);
        }

        this.streams.push(screenStream);

        screenTrack.onended = () => {
            if (screenAudioTrack) {
                screenAudioTrack.stop();
            }

            this.localScreenTrack = null;

            if (!this.ws || !this.peer) {
                return;
            }

            // @ts-ignore: we actually mean to pass null here
            this.peer.replaceTrack(screenTrack, null, screenStream);
            this.ws.send('screen_off');
        };

        this.peer.addStream(screenStream);

        this.ws.send('screen_on', {
            data: JSON.stringify({
                screenStreamID: screenStream.id,
            }),
        });
    }

    public async shareScreen(sourceID?: string, withAudio?: boolean) {
        if (!this.ws || !this.peer) {
            return null;
        }

        const screenStream = await getScreenStream(sourceID, withAudio);
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

    public async getStats(): Promise<RTCStats | null> {
        // @ts-ignore
        // eslint-disable-next-line no-underscore-dangle
        if (!this.peer || !this.peer._pc) {
            throw new Error('not connected');
        }

        // @ts-ignore
        // eslint-disable-next-line no-underscore-dangle
        const stats = await this.peer._pc.getStats(null);

        return parseRTCStats(stats);
    }
}
