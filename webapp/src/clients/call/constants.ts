// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {AudioCaptureOptions, AudioPresets, ConnectionQuality, TrackPublishDefaults} from 'livekit-client';

/**
 * CallClient emitted public event names.
 */
export const CALL_EVENT = {
    WEBSOCKET_EVENT: 'websocketEvent',
    CONNECTED: 'connect',
    DISCONNECTED: 'close',
    RECONNECTING: 'reconnecting',
    RECONNECTED: 'reconnected',
    ERROR: 'error',
    INIT_AUDIO: 'initaudio',
    MUTE: 'mute',
    UNMUTE: 'unmute',
    USERS_VOICE_ACTIVITY_CHANGED: 'usersVoiceActivityChanged',
    REMOTE_VOICE_STREAM: 'remoteVoiceStream',
    USER_JOINED: 'userJoined',
    USER_LEFT: 'userLeft',
    DEVICE_CHANGE: 'devicechange',
    DEVICE_FALLBACK: 'devicefallback',
    LOCAL_SCREEN_STREAM: 'localScreenStream',
    LOCAL_SCREEN_STREAM_OFF: 'localScreenStreamOff',
    REMOTE_SCREEN_STREAM: 'remoteScreenStream',
    REMOTE_SCREEN_STREAM_OFF: 'remoteScreenStreamOff',
    QUALITY_CHANGED: 'qualityChanged',
    RAISE_HAND: 'raiseHand',
    LOWER_HAND: 'lowerHand',
    REACTION: 'reaction',
} as const;

export const CALL_ATTRIBUTES = {
    RAISED_HAND: 'raised_hand',
} as const;

export const CALL_MESSAGE_TOPICS = {
    REACTION: 'reaction',
} as const;

export {ConnectionQuality as CONNECTION_QUALITY};

// Plugin call API routes
export const CALL_TOKEN_API_PATH = 'livekit-token';
export const USER_ID_SESSION_ID_SEPARATOR = '___';

export const AUDIO_CAPTURE_DEFAULTS: AudioCaptureOptions = {
    autoGainControl: true,
    echoCancellation: true,
    noiseSuppression: true,
};

export const TRACK_PUBLISHING_DEFAULTS: TrackPublishDefaults = {
    dtx: true,
    red: true,
    audioPreset: AudioPresets.speech,
};
