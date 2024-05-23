/* eslint-disable max-lines */
// eslint-disable-next-line simple-import-sort/imports
import {parseRTCStats, RTCMonitor, RTCPeer} from '@mattermost/calls-common';
import {EmojiData} from '@mattermost/calls-common/lib/types';
import {EventEmitter} from 'events';

// @ts-ignore
import {deflate} from 'pako/lib/deflate';
import {AudioDevices, CallsClientConfig, CallsClientJoinData, CallsClientStats, TrackInfo} from 'src/types/types';

import {logDebug, logErr, logInfo, logWarn} from './log';
import {getScreenStream} from './utils';
import {WebSocketClient, WebSocketError, WebSocketErrorType} from './websocket';

export const AudioInputPermissionsError = new Error('missing audio input permissions');
export const AudioInputMissingError = new Error('no audio input available');
export const rtcPeerErr = new Error('rtc peer error');
export const rtcPeerTimeoutErr = new Error('timed out waiting for rtc connection');
export const rtcPeerCloseErr = new Error('rtc peer close');
export const insecureContextErr = new Error('insecure context');
export const userRemovedFromChannelErr = new Error('user was removed from channel');
export const userLeftChannelErr = new Error('user has left channel');

const rtcMonitorInterval = 4000;

export default class CallsClient extends EventEmitter {
    public channelID: string;
    private readonly config: CallsClientConfig;
    private peer: RTCPeer | null;
    public ws: WebSocketClient | null;
    private localScreenTrack: MediaStreamTrack | null = null;
    private remoteScreenTrack: MediaStreamTrack | null = null;
    private remoteVoiceTracks: MediaStreamTrack[];
    public currentAudioInputDevice: MediaDeviceInfo | null = null;
    public currentAudioOutputDevice: MediaDeviceInfo | null = null;
    private voiceTrackAdded: boolean;
    private streams: MediaStream[];
    private stream: MediaStream | null;
    private audioDevices: AudioDevices;
    public audioTrack: MediaStreamTrack | null;
    private readonly onDeviceChange: () => void;
    private readonly onBeforeUnload: () => void;
    private closed = false;
    private connected = false;
    public initTime = Date.now();
    private rtcMonitor: RTCMonitor | null = null;

    constructor(config: CallsClientConfig) {
        super();
        this.ws = null;
        this.peer = null;
        this.audioTrack = null;
        this.currentAudioInputDevice = null;
        this.currentAudioInputDevice = null;
        this.voiceTrackAdded = false;
        this.streams = [];
        this.remoteVoiceTracks = [];
        this.stream = null;
        this.audioDevices = {inputs: [], outputs: []};
        this.channelID = '';
        this.config = config;
        this.onDeviceChange = async () => {
            await this.updateDevices();
        };
        this.onBeforeUnload = () => {
            logDebug('unload');
            this.disconnect();
        };
        window.addEventListener('beforeunload', this.onBeforeUnload);
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

    private async initAudio(deviceId?: string) {
        const audioOptions: MediaTrackConstraints = {
            autoGainControl: true,
            echoCancellation: true,
            noiseSuppression: true,
        };

        if (deviceId) {
            audioOptions.deviceId = {
                exact: deviceId,
            };
        }

        const defaultInputID = window.localStorage.getItem('calls_default_audio_input');
        const defaultOutputID = window.localStorage.getItem('calls_default_audio_output');
        if (defaultInputID && !this.currentAudioInputDevice) {
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

            this.audioTrack.enabled = false;

            this.emit('initaudio');
        } catch (err) {
            logErr(err);
            if (this.audioDevices.inputs.length > 0) {
                throw AudioInputPermissionsError;
            }
            throw AudioInputMissingError;
        }
    }

    public async init(joinData: CallsClientJoinData) {
        this.channelID = joinData.channelID;

        if (!window.isSecureContext) {
            throw insecureContextErr;
        }

        await this.updateDevices();
        navigator.mediaDevices.addEventListener('devicechange', this.onDeviceChange);

        try {
            await this.initAudio();
            if (this.closed) {
                this.cleanup();
                return;
            }
        } catch (err) {
            this.emit('error', err);
        }

        const ws = new WebSocketClient(this.config.wsURL, this.config.authToken);
        this.ws = ws;

        ws.on('error', (err: WebSocketError) => {
            logErr('ws error', err);
            switch (err.type) {
            case WebSocketErrorType.Native:
                break;
            case WebSocketErrorType.ReconnectTimeout:
                this.ws = null;
                this.disconnect(err);
                break;
            case WebSocketErrorType.Join:
                this.disconnect(err);
                break;
            default:
            }
        });

        ws.on('close', (code?: number) => {
            logDebug(`ws close: ${code}`);
        });

        ws.on('open', (originalConnID: string, prevConnID: string, isReconnect: boolean) => {
            if (isReconnect) {
                logDebug('ws reconnect, sending reconnect msg');
                ws.send('reconnect', {
                    channelID: joinData.channelID,
                    originalConnID,
                    prevConnID,
                });
            } else {
                logDebug('ws open, sending join msg');
                ws.send('join', joinData);
            }
        });

        ws.on('join', async () => {
            logDebug('join ack received, initializing connection');

            const peer = new RTCPeer({
                iceServers: this.config.iceServers || [],
                logger: {
                    logDebug,
                    logErr,
                    logWarn,
                    logInfo,
                },
                simulcast: this.config.simulcast,
            });

            this.peer = peer;

            this.rtcMonitor = new RTCMonitor({
                peer,
                logger: {
                    logDebug,
                    logErr,
                    logWarn,
                    logInfo,
                },
                monitorInterval: rtcMonitorInterval,
            });
            this.rtcMonitor.on('mos', (mos: number) => this.emit('mos', mos));

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
                logDebug(`local candidate: ${JSON.stringify(candidate)}`);

                ws.send('ice', {
                    data: JSON.stringify(candidate),
                });
            });

            peer.on('error', (err) => {
                logErr('peer error', err);
                if (!this.closed) {
                    this.disconnect(err === rtcPeerTimeoutErr.message ? rtcPeerTimeoutErr : rtcPeerErr);
                }
            });

            peer.on('stream', (remoteStream) => {
                logDebug('new remote stream received', remoteStream.id);
                for (const track of remoteStream.getTracks()) {
                    logDebug('remote track', track.kind, track.id);
                }

                this.streams.push(remoteStream);

                if (remoteStream.getAudioTracks().length > 0) {
                    this.emit('remoteVoiceStream', remoteStream);
                    this.remoteVoiceTracks.push(...remoteStream.getAudioTracks());
                } else if (remoteStream.getVideoTracks().length > 0) {
                    this.emit('remoteScreenStream', remoteStream);
                    this.remoteScreenTrack = remoteStream.getVideoTracks()[0];
                }
            });

            peer.on('connect', () => {
                logDebug('rtc connected');
                this.emit('connect');
                this.rtcMonitor?.start();
                this.connected = true;
            });

            peer.on('close', () => {
                logDebug('rtc closed');
                if (!this.closed) {
                    this.disconnect(rtcPeerCloseErr);
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
                if (this.peer) {
                    await this.peer.signal(data);
                }
            }
        });
    }

    public destroy() {
        this.removeAllListeners('close');
        this.removeAllListeners('connect');
        this.removeAllListeners('remoteVoiceStream');
        this.removeAllListeners('remoteScreenStream');
        this.removeAllListeners('localScreenStream');
        this.removeAllListeners('devicechange');
        this.removeAllListeners('error');
        this.removeAllListeners('initaudio');
        this.removeAllListeners('mute');
        this.removeAllListeners('unmute');
        this.removeAllListeners('raise_hand');
        this.removeAllListeners('lower_hand');
        this.removeAllListeners('mos');
        window.removeEventListener('beforeunload', this.onBeforeUnload);
        navigator.mediaDevices?.removeEventListener('devicechange', this.onDeviceChange);
    }

    public async setAudioInputDevice(device: MediaDeviceInfo) {
        if (!this.peer) {
            return;
        }

        window.localStorage.setItem('calls_default_audio_input', device.deviceId);
        this.currentAudioInputDevice = device;

        // We emit this event so it's easier to keep state in sync between widget and pop out.
        this.emit('devicechange', this.audioDevices);

        // If no track/stream exists we need to initialize again.
        // This edge case can happen if the default input device failed
        // but there are potentially more valid ones to choose (MM-48822).
        if (!this.audioTrack || !this.stream) {
            await this.initAudio(device.deviceId);
            return;
        }

        const isEnabled = this.audioTrack.enabled;
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
            },
        });
        this.streams.push(newStream);
        const newTrack = newStream.getAudioTracks()[0];
        this.stream.removeTrack(this.audioTrack);
        this.stream.addTrack(newTrack);
        newTrack.enabled = isEnabled;
        if (isEnabled) {
            if (this.voiceTrackAdded) {
                logDebug('replacing track to peer', newTrack.id);
                this.peer.replaceTrack(this.audioTrack.id, newTrack);
            } else {
                logDebug('adding track to peer', newTrack.id, this.stream.id);
                await this.peer.addTrack(newTrack, this.stream);
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

        // We emit this event so it's easier to keep state in sync between widget and pop out.
        this.emit('devicechange', this.audioDevices);
    }

    public disconnect(err?: Error) {
        logDebug('disconnect');

        if (this.closed) {
            logErr('client already disconnected');
            return;
        }

        this.rtcMonitor?.stop();

        this.closed = true;
        if (this.peer) {
            this.getStats().then((stats) => {
                sessionStorage.setItem('calls_client_stats', JSON.stringify(stats));
            }).catch((statsErr) => {
                logErr(statsErr);
            });
            this.peer.destroy();
            this.peer = null;
        }

        this.cleanup();

        if (this.ws) {
            this.ws.send('leave');
            this.ws.close();
            this.ws = null;
        }

        this.emit('close', err);
    }

    private cleanup() {
        this.streams.forEach((s) => {
            s.getTracks().forEach((track) => {
                track.stop();
                track.dispatchEvent(new Event('ended'));
            });
        });
    }

    public mute() {
        if (!this.peer || !this.audioTrack || !this.stream) {
            return;
        }

        logDebug('replacing track to peer', null);

        // @ts-ignore: we actually mean (and need) to pass null here
        this.peer.replaceTrack(this.audioTrack.id, null);

        this.audioTrack.enabled = false;

        this.emit('mute');

        if (this.ws) {
            this.ws.send('mute');
        }
    }

    public async unmute() {
        if (!this.peer) {
            return;
        }

        if (!this.audioTrack) {
            try {
                await this.initAudio();
            } catch (err) {
                this.emit('error', err);
                return;
            }
        }

        // NOTE: we purposely clear the monitor's stats cache upon unmuting
        // in order to skip some calculations since upon muting we actually
        // stop sending packets which would result in stats to be skewed as
        // soon as we resume sending.
        // This is not perfect but it avoids having to constantly send
        // silence frames when muted.
        this.rtcMonitor?.clearCache();

        if (this.audioTrack) {
            if (this.voiceTrackAdded) {
                logDebug('replacing track to peer', this.audioTrack.id);
                this.peer.replaceTrack(this.audioTrack.id, this.audioTrack);
            } else if (this.stream) {
                logDebug('adding track to peer', this.audioTrack.id, this.stream.id);
                await this.peer.addTrack(this.audioTrack, this.stream);
                this.voiceTrackAdded = true;
            }
            this.audioTrack.enabled = true;
        }

        this.emit('unmute');

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
        if (!this.remoteScreenTrack || this.remoteScreenTrack.readyState !== 'live') {
            return null;
        }
        return new MediaStream([this.remoteScreenTrack]);
    }

    public getRemoteVoiceTracks(): MediaStreamTrack[] {
        const tracks = [];
        for (const track of this.remoteVoiceTracks) {
            if (track.readyState === 'live') {
                tracks.push(track);
            }
        }
        return tracks;
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

            this.peer.removeTrack(screenTrack.id);
            this.ws.send('screen_off');
        };

        logDebug('adding stream to peer', screenStream.id);
        this.peer.addStream(screenStream);

        this.ws.send('screen_on', {
            data: JSON.stringify({
                screenStreamID: screenStream.id,
            }),
        });

        this.emit('localScreenStream', screenStream);
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
        this.emit('raise_hand');
        this.ws?.send('raise_hand');
    }

    public unraiseHand() {
        this.emit('lower_hand');
        this.ws?.send('unraise_hand');
    }

    public sendUserReaction(data: EmojiData) {
        this.ws?.send('react', {
            data: JSON.stringify(data),
        });
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

    public getSessionID() {
        return this.ws?.getOriginalConnID();
    }
}
