import {EventEmitter} from 'events';

// @ts-ignore
import {deflate} from 'pako/lib/deflate.js';

import {CallsClientConfig, AudioDevices, CallsClientStats, TrackInfo} from 'src/types/types';

import RTCPeer from './rtcpeer';

import {getScreenStream, setSDPMaxVideoBW} from './utils';
import {logErr, logDebug} from './log';
import {WebSocketClient, wsReconnectionTimeoutErr} from './websocket';
import VoiceActivityDetector from './vad';

import {parseRTCStats} from './rtc_stats';

export const AudioInputPermissionsError = new Error('missing audio input permissions');
export const AudioInputMissingError = new Error('no audio input available');

export default class CallsClient extends EventEmitter {
    public channelID: string;
    private readonly config: CallsClientConfig;
    private peer: RTCPeer | null;
    private ws: WebSocketClient | null;
    private localScreenTrack: any;
    private remoteScreenTrack: any;
    public currentAudioInputDevice: MediaDeviceInfo | null = null;
    public currentAudioOutputDevice: MediaDeviceInfo | null = null;
    private voiceDetector: any;
    private voiceTrackAdded: boolean;
    private streams: MediaStream[];
    private stream: MediaStream | null;
    private audioDevices: AudioDevices;
    private audioTrack: MediaStreamTrack | null;
    public isHandRaised: boolean;
    private onDeviceChange: () => void;
    private onBeforeUnload: () => void;
    private closed = false;
    private initTime = Date.now();

    constructor(config: CallsClientConfig) {
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
        this.config = config;
        this.onDeviceChange = () => {
            this.updateDevices();
        };
        this.onBeforeUnload = () => {
            logDebug('unload');
            this.disconnect();
        };
        window.addEventListener('beforeunload', this.onBeforeUnload);
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
        logDebug('a/v device change detected');

        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.audioDevices = {
                inputs: devices.filter((device) => device.kind === 'audioinput'),
                outputs: devices.filter((device) => device.kind === 'audiooutput'),
            };
            this.emit('devicechange', this.audioDevices);
        } catch (err) {
            logErr(err);
        }
    }

    public async init(channelID: string, title?: string) {
        this.channelID = channelID;
        await this.updateDevices();
        navigator.mediaDevices.addEventListener('devicechange', this.onDeviceChange);

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

        try {
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
        } catch (err) {
            logErr(err);
            this.emit('error', this.audioDevices.inputs.length > 0 ? AudioInputPermissionsError : AudioInputMissingError);
        }

        const ws = new WebSocketClient(this.config.wsURL);
        this.ws = ws;

        ws.on('error', (err) => {
            logErr('ws error', err);
            if (err === wsReconnectionTimeoutErr) {
                this.ws = null;
                this.disconnect();
            }
        });

        ws.on('close', (code?: number) => {
            logDebug(`ws close: ${code}`);
        });

        ws.on('open', (originalConnID: string, prevConnID: string, isReconnect: boolean) => {
            if (isReconnect) {
                logDebug('ws reconnect, sending reconnect msg');
                ws.send('reconnect', {
                    channelID,
                    originalConnID,
                    prevConnID,
                });
            } else {
                logDebug('ws open, sending join msg');
                ws.send('join', {
                    channelID,
                    title,
                });
            }
        });

        ws.on('join', async () => {
            logDebug('join ack received, initializing connection');

            const peer = new RTCPeer({
                iceServers: this.config.iceServers || [],
            });

            this.peer = peer;

            peer.on('offer', (sdp) => {
                logDebug(`local signal: ${JSON.stringify(sdp)}`);
                ws.send('sdp', {
                    data: deflate(JSON.stringify(sdp)),
                }, true);
            });

            peer.on('answer', (sdp) => {
                logDebug(`local signal: ${JSON.stringify(sdp)}`);
                ws.send('sdp', {
                    data: deflate(JSON.stringify(sdp)),
                }, true);
            });

            peer.on('candidate', (candidate) => {
                ws.send('ice', {
                    data: JSON.stringify(candidate),
                });
            });

            peer.on('error', (err) => {
                logErr('peer error', err);
                if (!this.closed) {
                    this.disconnect();
                }
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

            peer.on('close', () => {
                logDebug('rtc closed');
                if (!this.closed) {
                    this.disconnect();
                }
            });
        });

        ws.on('message', async ({data}) => {
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
                    await this.peer.signal(data);
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
        this.removeAllListeners('devicechange');
        this.removeAllListeners('error');
        window.removeEventListener('beforeunload', this.onBeforeUnload);
        navigator.mediaDevices.removeEventListener('devicechange', this.onDeviceChange);
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
                this.peer.replaceTrack(this.audioTrack.id, newTrack);
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
        logDebug('disconnect');

        if (this.closed) {
            logErr('client already disconnected');
            return;
        }

        this.closed = true;
        if (this.peer) {
            this.getStats().then((stats) => {
                sessionStorage.setItem('calls_client_stats', JSON.stringify(stats));
            }).catch((err) => {
                logErr(err);
            });
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
            this.ws.send('leave');
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
        this.peer.replaceTrack(this.audioTrack.id, null);
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
            this.peer.replaceTrack(this.audioTrack.id, this.audioTrack);
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
            this.peer.replaceTrack(screenTrack.id, null);
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

    public async getStats(): Promise<CallsClientStats | null> {
        if (!this.peer) {
            throw new Error('not connected');
        }

        const tracksInfo : TrackInfo[] = [];
        this.streams.forEach((stream) => {
            return stream.getTracks().forEach((track) => {
                tracksInfo.push({
                    streamID: stream.id,
                    id: track.id,
                    kind: track.kind,
                    label: track.label,
                    enabled: track.enabled,
                    readyState: track.readyState,
                });
            });
        });

        const stats = await this.peer.getStats();

        return {
            initTime: this.initTime,
            callID: this.channelID,
            tracksInfo,
            rtcStats: stats ? parseRTCStats(stats) : null,
        };
    }

    public getAudioDevices() {
        return this.audioDevices;
    }
}
