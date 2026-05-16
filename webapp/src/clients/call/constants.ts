// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {ConnectionQuality} from 'livekit-client';

/**
 * CallClient emitted public event names.
 */
export const CALL_EVENT = {
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
    QUALITY_CHANGED: 'qualityChanged',
} as const;

export {ConnectionQuality as CONNECTION_QUALITY};

// Plugin call API routes
export const CALL_TOKEN_API_PATH = 'livekit-token';
export const USER_ID_SESSION_ID_SEPARATOR = '___';
