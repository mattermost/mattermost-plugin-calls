// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// eslint-disable max-lines
// eslint-disable-next-line simple-import-sort/imports
import {parseRTCStats, RTCMonitor, RTCPeer} from '@mattermost/calls-common';
import type {EmojiData, CallsClientJoinData, TrackInfo, RTPEncodingParameters} from '@mattermost/calls-common/lib/types';

import {EventEmitter} from 'events';

import {zlibSync, strToU8} from 'fflate';
import {MediaDevices, CallsClientConfig, CallsClientStats, TrackMetadata} from 'src/types/types';

import {logDebug, logErr, logInfo, logWarn, persistClientLogs} from './log';
import {getScreenStream, getPersistentStorage, getPluginStaticPath} from './utils';
import {WebSocketClient, WebSocketError, WebSocketErrorType} from './websocket';
import {
    STORAGE_CALLS_CLIENT_STATS_KEY,
    STORAGE_CALLS_DEFAULT_AUDIO_INPUT_KEY,
    STORAGE_CALLS_DEFAULT_AUDIO_OUTPUT_KEY,
    STORAGE_CALLS_DEFAULT_VIDEO_INPUT_KEY,
} from 'src/constants';
import {type BgBlurData, getBgBlurData, getAdvancedNoiseCancellation} from 'src/local_storage';
import Segmenter from 'src/segmenter';

export const AudioInputPermissionsError = new Error('missing audio input permissions');
export const AudioInputMissingError = new Error('no audio input available');
export const VideoInputPermissionsError = new Error('missing video input permissions');
export const VideoInputMissingError = new Error('no video input available');
export const rtcPeerErr = new Error('rtc peer error');
export const rtcPeerTimeoutErr = new Error('timed out waiting for rtc connection');
export const rtcPeerCloseErr = new Error('rtc peer close');
export const insecureContextErr = new Error('insecure context');
export const userRemovedFromChannelErr = new Error('user was removed from channel');
export const userLeftChannelErr = new Error('user has left channel');
export const DefaultVideoTrackOptions: MediaTrackConstraints = {

    // TODO: consider exposing in user preferences
    frameRate: {
        ideal: 30,
    },
    width: {
        ideal: 640,
    },
    height: {
        ideal: 360,
    },
};

const rtcMonitorInterval = 10000;

export default class CallsClient extends EventEmitter {
    public channelID: string;
    private readonly config: CallsClientConfig;
    private peer: RTCPeer | null;
    public ws: WebSocketClient | null;
    private localScreenTrack: MediaStreamTrack | null = null;
    public localVideoStream: MediaStream | null = null;
    private remoteScreenTrack: MediaStreamTrack | null = null;
    private remoteVoiceTracks: MediaStreamTrack[];
    private remoteVideoTracks: MediaStreamTrack[];
    public currentAudioInputDevice: MediaDeviceInfo | null = null;
    public currentAudioOutputDevice: MediaDeviceInfo | null = null;
    public currentVideoInputDevice: MediaDeviceInfo | null = null;
    private voiceTrackAdded: boolean;
    private videoTrackAdded: boolean;
    private streams: MediaStream[];
    private stream: MediaStream | null;
    private audioDevices: MediaDevices;
    private videoDevices: MediaDeviceInfo[];
    public audioTrack: MediaStreamTrack | null;
    private readonly onDeviceChange: () => void;
    private readonly onBeforeUnload: () => void;
    private closed = false;
    private connected = false;
    public initTime = Date.now();
    private rtcMonitor: RTCMonitor | null = null;
    private av1Codec: RTCRtpCodecCapability | null = null;
    private defaultAudioTrackOptions: MediaTrackConstraints;
    private defaultVideoTrackOptions: MediaTrackConstraints;
    private defaultVideoTrackEncodings: RTPEncodingParameters[];
    private segmenter: Segmenter | null = null;
    private audioCtx: AudioContext | null = null;
    private noiseSuppressionNode: AudioWorkletNode | null = null;

    constructor(config: CallsClientConfig) {
        logDebug('creating new calls client', JSON.stringify(config));
        super();
        this.ws = null;
        this.peer = null;
        this.audioTrack = null;
        this.currentAudioInputDevice = null;
        this.currentAudioInputDevice = null;
        this.currentVideoInputDevice = null;
        this.voiceTrackAdded = false;
        this.videoTrackAdded = false;
        this.streams = [];
        this.remoteVoiceTracks = [];
        this.remoteVideoTracks = [];
        this.stream = null;
        this.audioDevices = {inputs: [], outputs: []};
        this.videoDevices = [];
        this.channelID = '';
        this.config = config;
        this.defaultAudioTrackOptions = {
            autoGainControl: true,
            echoCancellation: true,
            noiseSuppression: true,
        };
        this.defaultVideoTrackOptions = DefaultVideoTrackOptions;
        this.defaultVideoTrackEncodings = [
            {maxBitrate: 1000 * 1000, maxFramerate: 30, scaleResolutionDownBy: 1.0},
        ];
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

            if (this.config.enableVideo) {
                this.videoDevices = devices.filter((device) => device.kind === 'videoinput');
            }

            this.emit('devicechange', this.audioDevices, this.videoDevices);
        } catch (err) {
            logErr(err);
        }
    }

    private async initVideo(startVideo: boolean, deviceId?: string) {
        const videoOptions: MediaTrackConstraints = {
            ...this.defaultVideoTrackOptions,
        };

        if (deviceId) {
            videoOptions.deviceId = {
                exact: deviceId,
            };
        } else if (this.currentVideoInputDevice) {
            videoOptions.deviceId = {
                exact: this.currentVideoInputDevice.deviceId,
            };
        } else {
            let defaultInputDevice: {deviceId: string; label?: string} = {
                deviceId: '',
            };
            const defaultVideoInputData = window.localStorage.getItem(STORAGE_CALLS_DEFAULT_VIDEO_INPUT_KEY);
            if (defaultVideoInputData) {
                try {
                    defaultInputDevice = JSON.parse(defaultVideoInputData);
                } catch (err) {
                    logErr('failed to parse default video input device', err);
                }
            }

            if (defaultInputDevice.deviceId) {
                let devices = this.videoDevices.filter((dev) => {
                    return dev.deviceId === defaultInputDevice.deviceId || dev.label === defaultInputDevice.label;
                });

                if (devices.length > 1) {
                // If there are multiple devices with the same label, we select the default device by ID.
                    logInfo('multiple video input devices found with the same label, checking by id', devices);
                    devices = devices.filter((dev) => dev.deviceId === defaultInputDevice.deviceId);
                }

                if (devices && devices.length === 1) {
                    logDebug(`found default video input device to use: ${devices[0].label}`);
                    videoOptions.deviceId = {
                        exact: devices[0].deviceId,
                    };
                    this.currentVideoInputDevice = devices[0];
                } else {
                    logDebug('video input device not found');
                    window.localStorage.removeItem(STORAGE_CALLS_DEFAULT_VIDEO_INPUT_KEY);
                }
            }
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: videoOptions,
                audio: false,
            });

            // updating the devices again cause some browsers (e.g Firefox) will
            // return empty labels unless permissions were previously granted.
            await this.updateDevices();

            // Video should be off by default (for now). We initialize it to ensure permissions are there but
            // don't need to keep it active until the user explicitly starts it from UI.
            if (startVideo) {
                this.localVideoStream = stream;
                this.streams.push(stream);
                stream.getVideoTracks()[0].enabled = false;
            } else {
                stream.getVideoTracks()[0].stop();
                stream.getVideoTracks()[0].dispatchEvent(new Event('ended'));
            }

            this.emit('initvideo');
        } catch (err) {
            logErr(err);
            if (this.videoDevices.length > 0) {
                throw VideoInputPermissionsError;
            }
            throw VideoInputMissingError;
        }
    }

    private async initAudio(deviceId?: string) {
        const audioOptions: MediaTrackConstraints = {
            ...this.defaultAudioTrackOptions,
        };

        if (deviceId) {
            audioOptions.deviceId = {
                exact: deviceId,
            };
        }

        let defaultInputDevice: {deviceId: string; label?: string} = {
            deviceId: '',
        };
        const defaultAudioInputData = window.localStorage.getItem(STORAGE_CALLS_DEFAULT_AUDIO_INPUT_KEY);
        if (defaultAudioInputData) {
            try {
                defaultInputDevice = JSON.parse(defaultAudioInputData);
            } catch {
                // Backwards compatibility case when we used to store the device id directly (before MM-63274).
                defaultInputDevice = {
                    deviceId: defaultAudioInputData,
                };
            }
        }

        let defaultOutputDevice: {deviceId: string; label?: string} = {
            deviceId: '',
        };
        const defaultAudioOutputData = window.localStorage.getItem(STORAGE_CALLS_DEFAULT_AUDIO_OUTPUT_KEY);
        if (defaultAudioOutputData) {
            try {
                defaultOutputDevice = JSON.parse(defaultAudioOutputData);
            } catch {
                // Backwards compatibility case when we used to store the device id directly (before MM-63274).
                defaultOutputDevice = {
                    deviceId: defaultAudioOutputData,
                };
            }
        }

        if (defaultInputDevice.deviceId && !this.currentAudioInputDevice) {
            let devices = this.audioDevices.inputs.filter((dev) => {
                return dev.deviceId === defaultInputDevice.deviceId || dev.label === defaultInputDevice.label;
            });

            if (devices.length > 1) {
                // If there are multiple devices with the same label, we select the default device by ID.
                logInfo('multiple audio input devices found with the same label, checking by id', devices);
                devices = devices.filter((dev) => dev.deviceId === defaultInputDevice.deviceId);
            }

            if (devices && devices.length === 1) {
                logDebug(`found default audio input device to use: ${devices[0].label}`);
                audioOptions.deviceId = {
                    exact: devices[0].deviceId,
                };
                this.currentAudioInputDevice = devices[0];
            } else {
                logDebug('audio input device not found');
                window.localStorage.removeItem(STORAGE_CALLS_DEFAULT_AUDIO_INPUT_KEY);
            }
        }

        if (defaultOutputDevice.deviceId) {
            let devices = this.audioDevices.outputs.filter((dev) => {
                return dev.deviceId === defaultOutputDevice.deviceId || dev.label === defaultOutputDevice.label;
            });

            if (devices.length > 1) {
                // If there are multiple devices with the same label, we select the default device by ID.
                logInfo('multiple audio output devices found with the same label, checking by id', devices);
                devices = devices.filter((dev) => dev.deviceId === defaultInputDevice.deviceId);
            }

            if (devices && devices.length === 1) {
                logDebug(`found default audio output device to use: ${devices[0].label}`);
                this.currentAudioOutputDevice = devices[0];
            } else {
                logDebug('audio output device not found');
                window.localStorage.removeItem(STORAGE_CALLS_DEFAULT_AUDIO_OUTPUT_KEY);
            }
        }

        if (getAdvancedNoiseCancellation()) {
            // Ideally here we'd turn off audioOptions.noiseSuppression since there's no point in doing it twice
            // but if we want to have this dynamic, it may be best to keep some level of noise suppression.

            // If for some reason (rare) stereo is returned it will be downmixed automatically.
            audioOptions.channelCount = {ideal: 1};

            // TODO: handle resampling if the device doesn't support 48kHz
            audioOptions.sampleRate = {exact: 48000};
        }

        try {
            logDebug('initializing audio stream', audioOptions);

            this.stream = await navigator.mediaDevices.getUserMedia({
                video: false,
                audio: audioOptions,
            });
            this.streams.push(this.stream);

            console.log(this.stream.getTracks()[0].getSettings());

            if (getAdvancedNoiseCancellation()) {
                logDebug('advanced noise cancellation enabled, initializing noise suppression');
                try {
                    this.stream = await this.initNoiseSuppression(this.stream);
                } catch (err) {
                    logErr('failed to init noise suppression', err);
                }
            }

            this.audioTrack = this.stream.getAudioTracks()[0];
            this.streams.push(this.stream);
            this.audioTrack.enabled = false;

            // updating the devices again cause some browsers (e.g Firefox) will
            // return empty labels unless permissions were previously granted.
            await this.updateDevices();

            this.emit('initaudio');
        } catch (err) {
            logErr(err);
            if (this.audioDevices.inputs.length > 0) {
                throw AudioInputPermissionsError;
            }
            throw AudioInputMissingError;
        }
    }

    private async initNoiseSuppression(stream: MediaStream) {
        if (!this.audioCtx) {
            this.audioCtx = new AudioContext({sampleRate: 48000});
            console.log(this.audioCtx);
        }

        await this.audioCtx.resume();

        if (this.noiseSuppressionNode) {
            logWarn('noiseSuppressionNode already exists');
            this.noiseSuppressionAudioSource.disconnect(this.noiseSuppressionNode);
            this.noiseSuppressionAudioSource = this.audioCtx.createMediaStreamSource(stream);
            console.log(this.noiseSuppressionAudioSource);
            this.noiseSuppressionAudioSource.connect(this.noiseSuppressionNode);
            return this.noiseSuppressionAudioDestination.stream;
        }
        const init = performance.now();
        await this.audioCtx.audioWorklet.addModule(`${getPluginStaticPath()}/rnnoise/processor.bundle.js`);
        logDebug('audio worklet module loaded', performance.now() - init);

        this.noiseSuppressionNode = new AudioWorkletNode(this.audioCtx, 'rnnoise', {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [1],
        });
        this.noiseSuppressionNode.channelCount = 1;
        this.noiseSuppressionNode.channelCountMode = 'explicit';
        console.log(this.noiseSuppressionNode);

        let n = 0;
        let t0 = 0;
        let total = 0;
        this.noiseSuppressionNode.port.onmessage = ({data}) => {
            if (data === 'start') {
                t0 = performance.now();
            } else if (data === 'stop') {
                total += (performance.now() - t0);
                n++;
                if (n % 1000 === 0) {
                    logDebug('processing time for ~10 second of audio', total);
                    total = 0;
                    n = 0;
                }
            } else {
                logDebug(data);
            }
        };

        this.noiseSuppressionAudioSource = this.audioCtx.createMediaStreamSource(stream);
        console.log(this.noiseSuppressionAudioSource);
        this.noiseSuppressionAudioSource.connect(this.noiseSuppressionNode);
        this.noiseSuppressionAudioDestination = this.audioCtx.createMediaStreamDestination();
        this.noiseSuppressionNode.connect(this.noiseSuppressionAudioDestination);

        return this.noiseSuppressionAudioDestination.stream;
    }

    private collectICEStats() {
        const start = Date.now();
        const seenMap: {[key: string]: string} = {};

        const gatherStats = async () => {
            if (!this.ws || !this.peer) {
                return;
            }

            try {
                const stats = parseRTCStats(await this.peer.getStats()).iceStats;
                for (const state of Object.keys(stats)) {
                    for (const pair of stats[state]) {
                        const seenState = seenMap[pair.id];
                        seenMap[pair.id] = pair.state;

                        if (seenState !== pair.state) {
                            logDebug('ice candidate pair stats', JSON.stringify(pair));
                        }

                        if (seenState === 'succeeded' || state !== 'succeeded') {
                            continue;
                        }

                        if (!pair.local || !pair.remote) {
                            continue;
                        }

                        this.ws.send('metric', {
                            metric_name: 'client_ice_candidate_pair',
                            data: JSON.stringify({
                                state: pair.state,
                                local: {
                                    type: pair.local.candidateType,
                                    protocol: pair.local.protocol,
                                },
                                remote: {
                                    type: pair.remote.candidateType,
                                    protocol: pair.remote.protocol,
                                },
                            }),
                        });
                    }
                }
            } catch (err) {
                logErr('failed to parse ICE stats', err);
            }

            // Repeat the check for at most 30 seconds.
            if (Date.now() < start + 30000) {
                // We check every two seconds.
                setTimeout(gatherStats, 2000);
            }
        };

        gatherStats();
    }

    public async init(joinData: CallsClientJoinData) {
        this.channelID = joinData.channelID;

        if (this.config.enableAV1 && !this.config.simulcast) {
            this.av1Codec = await RTCPeer.getVideoCodec('video/AV1');
            if (this.av1Codec) {
                logDebug('client has AV1 support');
                joinData.av1Support = true;
            }
        } else if (this.config.enableAV1 && this.config.simulcast) {
            logWarn('both simulcast and av1 support are enabled');
        }

        if (this.config.dcSignaling) {
            logDebug('enabling DC signaling on client');
            joinData.dcSignaling = true;
        }

        if (!window.isSecureContext) {
            throw insecureContextErr;
        }

        await this.updateDevices();
        navigator.mediaDevices.addEventListener('devicechange', this.onDeviceChange);

        try {
            const initializers = [this.initAudio()];
            if (this.config.enableVideo) {
                initializers.push(this.initVideo(false));
            }

            await Promise.all(initializers);

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
                dcSignaling: this.config.dcSignaling,
            });

            this.peer = peer;

            this.collectICEStats();

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

            const sdpHandler = (sdp: RTCSessionDescription) => {
                const payload = JSON.stringify(sdp);

                // SDP data is compressed using zlib since it's text based
                // and can grow substantially, potentially hitting the maximum
                // message size (4KB).
                ws.send('sdp', {
                    data: zlibSync(strToU8(payload)),
                }, true);
            };
            peer.on('offer', sdpHandler);
            peer.on('answer', sdpHandler);

            peer.on('candidate', (candidate) => {
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

            peer.on('stream', (remoteStream: MediaStream, trackInfo: TrackInfo) => {
                logDebug('new remote stream received', remoteStream.id, trackInfo);
                for (const track of remoteStream.getTracks()) {
                    logDebug('remote track', track.kind, track.id);
                }

                this.streams.push(remoteStream);

                if (remoteStream.getAudioTracks().length > 0) {
                    this.emit('remoteVoiceStream', remoteStream);
                    this.remoteVoiceTracks.push(...remoteStream.getAudioTracks());
                } else if (remoteStream.getVideoTracks().length > 0) {
                    if (trackInfo?.type === 'video') {
                        this.emit('remoteVideoStream', remoteStream);
                        this.remoteVideoTracks.push(remoteStream.getVideoTracks()[0]);
                    } else {
                        this.emit('remoteScreenStream', remoteStream);
                        this.remoteScreenTrack = remoteStream.getVideoTracks()[0];
                    }
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
        this.removeAllListeners('localVideoStream');
        this.removeAllListeners('devicechange');
        this.removeAllListeners('error');
        this.removeAllListeners('initaudio');
        this.removeAllListeners('initvideo');
        this.removeAllListeners('mute');
        this.removeAllListeners('unmute');
        this.removeAllListeners('raise_hand');
        this.removeAllListeners('lower_hand');
        this.removeAllListeners('mos');
        this.removeAllListeners('video_on');
        this.removeAllListeners('video_off');
        window.removeEventListener('beforeunload', this.onBeforeUnload);
        navigator.mediaDevices?.removeEventListener('devicechange', this.onDeviceChange);
        this.segmenter?.stop();
        this.segmenter = null;
        this.noiseSuppressionNode?.port?.postMessage({cmd: 'stop'});
        this.audioCtx?.close();
        this.audioCtx = null;
        persistClientLogs();
    }

    public async setAudioInputDevice(device: MediaDeviceInfo) {
        if (!this.peer) {
            return;
        }

        window.localStorage.setItem(STORAGE_CALLS_DEFAULT_AUDIO_INPUT_KEY, JSON.stringify(device));
        this.currentAudioInputDevice = device;

        // We emit this event so it's easier to keep state in sync between widget and pop out.
        this.emit('devicechange', this.audioDevices, this.videoDevices);

        // If no track/stream exists we need to initialize again.
        // This edge case can happen if the default input device failed
        // but there are potentially more valid ones to choose (MM-48822).
        if (!this.audioTrack || !this.stream) {
            await this.initAudio(device.deviceId);
            return;
        }

        const isEnabled = this.audioTrack.enabled;
        let newStream = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: {
                ...this.defaultAudioTrackOptions,
                deviceId: {
                    exact: device.deviceId,
                },
            },
        });
        this.streams.push(newStream);

        if (getAdvancedNoiseCancellation()) {
            logDebug('advanced noise cancellation enabled, initializing noise suppression');
            try {
                newStream = await this.initNoiseSuppression(newStream);
            } catch (err) {
                logErr('failed to init noise suppression', err);
            }
        } else {
            // If noise suppression is enabled we are actually re-using the same track since
            // the destination node doesn't change, so we only need to stop in this case.
            this.audioTrack.stop();
        }

        const newTrack = newStream.getAudioTracks()[0];

        console.log(newTrack, this.audioTrack, this.stream.getAudioTracks());

        this.stream.removeTrack(this.audioTrack);
        this.stream.addTrack(newTrack);
        newTrack.enabled = isEnabled;
        if (isEnabled) {
            // voiceTrackAdded must be true if the track is enabled.
            logDebug('replacing track to peer', newTrack.id);
            this.peer.replaceTrack(this.audioTrack.id, newTrack);
        } else {
            this.voiceTrackAdded = false;
        }
        this.audioTrack = newTrack;
    }

    public async setVideoInputDevice(device: MediaDeviceInfo) {
        if (!this.peer) {
            return;
        }

        window.localStorage.setItem(STORAGE_CALLS_DEFAULT_VIDEO_INPUT_KEY, JSON.stringify(device));
        this.currentVideoInputDevice = device;

        // We emit this event so it's easier to keep state in sync between widget and pop out.
        this.emit('devicechange', this.audioDevices, this.videoDevices);

        // If no track/stream exists we need to initialize again.
        // This edge case can happen if the default input device failed
        // but there are potentially more valid ones to choose (MM-48822).
        if (!this.localVideoStream) {
            await this.initVideo(false, device.deviceId);
            return;
        }

        const newStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                ...this.defaultVideoTrackOptions,
                deviceId: {
                    exact: device.deviceId,
                },
            },
        });
        this.streams.push(newStream);

        const videoTrack = this.localVideoStream.getVideoTracks()[0];
        const isEnabled = videoTrack.enabled;
        videoTrack.stop();
        videoTrack.dispatchEvent(new Event('ended'));
        if (this.segmenter) {
            this.segmenter.stop();
            this.segmenter = null;
        }

        let newTrack = newStream.getVideoTracks()[0];

        this.localVideoStream.removeTrack(videoTrack);
        this.localVideoStream.addTrack(newTrack);
        this.localVideoStream = newStream;

        const bgBlurData = getBgBlurData();
        if (bgBlurData.blurBackground && bgBlurData.blurIntensity > 0) {
            logDebug('background blur enabled', bgBlurData);
            newTrack = await this.initBgBackgroundTrack(this.localVideoStream, bgBlurData);
        }

        newTrack.enabled = isEnabled;
        if (isEnabled) {
            // videoTrackAdded must be true if the track is enabled.
            logDebug('replacing track to peer', newTrack.id);
            this.peer.replaceTrack(videoTrack.id, newTrack);
            this.emit('localVideoStream', newStream);
        } else {
            this.videoTrackAdded = false;
        }
    }

    public async setAudioOutputDevice(device: MediaDeviceInfo) {
        if (!this.peer) {
            return;
        }
        window.localStorage.setItem(STORAGE_CALLS_DEFAULT_AUDIO_OUTPUT_KEY, JSON.stringify(device));
        this.currentAudioOutputDevice = device;

        // We emit this event so it's easier to keep state in sync between widget and pop out.
        this.emit('devicechange', this.audioDevices, this.videoDevices);
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
                getPersistentStorage().setItem(STORAGE_CALLS_CLIENT_STATS_KEY, JSON.stringify(stats));
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

        this.noiseSuppressionNode?.port?.postMessage({cmd: 'pause'});

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

        this.noiseSuppressionNode?.port?.postMessage({cmd: 'resume'});

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

    public getRemoteVideoStream(): MediaStream|null {
        if (this.remoteVideoTracks.length < 1 || this.remoteVideoTracks[this.remoteVideoTracks.length - 1].readyState !== 'live') {
            return null;
        }
        return new MediaStream([this.remoteVideoTracks[this.remoteVideoTracks.length - 1]]);
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

    public async setScreenStream(screenStream: MediaStream) {
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

        screenTrack.onended = async () => {
            if (screenAudioTrack) {
                screenAudioTrack.stop();
            }

            this.localScreenTrack = null;

            if (!this.ws || !this.peer) {
                return;
            }

            this.ws.send('screen_off');

            await this.peer.removeTrack(screenTrack.id);
        };

        logDebug('adding stream to peer', screenStream.id);

        // Always send a fallback track (VP8 encoded) for receivers that don't yet support AV1.
        await this.peer.addStream(screenStream);

        if (this.config.enableAV1 && this.av1Codec) {
            logDebug('AV1 supported, sending track', this.av1Codec);
            await this.peer.addStream(screenStream, [{
                codec: this.av1Codec,
            }]);
        }

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

        await this.setScreenStream(screenStream);

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

    private async initBgBackgroundTrack(stream: MediaStream, bgBlurData: BgBlurData) {
        const localVideoTrack = stream.getVideoTracks()[0];

        if (this.segmenter) {
            return localVideoTrack;
        }

        const canvas = document.createElement('canvas');
        const video = document.createElement('video');
        canvas.width = localVideoTrack.getSettings().width!;
        canvas.height = localVideoTrack.getSettings().height!;
        video.autoplay = true;
        video.srcObject = new MediaStream([localVideoTrack]);

        const outStream = canvas.captureStream(30);
        this.streams.push(outStream);
        const outTrack = outStream.getVideoTracks()[0];

        stream.removeTrack(localVideoTrack);
        stream.addTrack(outTrack);

        outTrack.onended = () => {
            localVideoTrack.stop();
            localVideoTrack.dispatchEvent(new Event('ended'));
            canvas.remove();
            video.remove();
        };

        this.segmenter = new Segmenter({
            inputVideo: video,
            outputCanvas: canvas,
        });
        this.segmenter.setBlurIntensity(bgBlurData.blurIntensity);

        return outTrack;
    }

    public async startVideo() {
        if (!this.ws || !this.peer || !this.config.enableVideo) {
            return null;
        }

        if (!this.localVideoStream) {
            try {
                logDebug('no local video stream, initializing');
                await this.initVideo(true);
            } catch (err) {
                this.emit('error', err);
                return null;
            }
        }

        // NOTE: we purposely clear the monitor's stats cache upon starting video
        // in order to skip some calculations since upon starting video we actually
        // stop sending packets which would result in stats to be skewed as
        // soon as we resume sending.
        // This is not perfect but it avoids having to constantly send
        // empty frames when the video is off.
        this.rtcMonitor?.clearCache();

        if (!this.localVideoStream) {
            logWarn('no local video stream');
            return null;
        }

        let localVideoTrack = this.localVideoStream.getVideoTracks()[0];
        const localVideoTrackID = localVideoTrack.id;
        localVideoTrack.enabled = true;

        const bgBlurData = getBgBlurData();
        if (bgBlurData.blurBackground && bgBlurData.blurIntensity > 0) {
            logDebug('background blur enabled', bgBlurData);
            localVideoTrack = await this.initBgBackgroundTrack(this.localVideoStream, bgBlurData);
        }

        if (this.videoTrackAdded) {
            await this.peer.replaceTrack(localVideoTrackID, localVideoTrack);
        } else {
            await this.peer.addTrack(localVideoTrack, this.localVideoStream, {encodings: this.defaultVideoTrackEncodings});
            if (this.config.enableAV1 && this.av1Codec) {
                logDebug('AV1 supported, sending track', this.av1Codec);
                await this.peer.addTrack(localVideoTrack, this.localVideoStream, {
                    codec: this.av1Codec,
                    encodings: this.defaultVideoTrackEncodings,
                });
            }
            this.videoTrackAdded = true;
        }

        this.emit('localVideoStream', this.localVideoStream);

        this.ws.send('video_on', {
            data: JSON.stringify({
                videoStreamID: this.localVideoStream.id,
            }),
        });
        this.emit('video_on');

        return this.localVideoStream;
    }

    public stopVideo() {
        if (!this.ws || !this.peer || !this.localVideoStream) {
            return;
        }

        const localVideoTrack = this.localVideoStream.getVideoTracks()[0];

        // @ts-ignore: we actually mean (and need) to pass null here
        this.peer.replaceTrack(localVideoTrack.id, null);
        localVideoTrack.enabled = false;
        this.emit('video_off');
        this.ws.send('video_off');
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

        const tracksInfo : TrackMetadata[] = [];
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

    public getVideoDevices() {
        return this.videoDevices;
    }

    public getSessionID() {
        return this.ws?.getOriginalConnID();
    }
}
