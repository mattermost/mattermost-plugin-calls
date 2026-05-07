// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// CallClient emitted public event names.
export const CALL_EVENT = {
    CONNECTED: 'connected',
    DISCONNECTED: 'disconnected',
    RECONNECTING: 'reconnecting',
    RECONNECTED: 'reconnected',
    ERROR: 'error',
    MUTE: 'mute',
    UNMUTE: 'unmute',
    USERS_VOICE_ACTIVITY_CHANGED: 'usersVoiceActivityChanged',
    REMOTE_VOICE_STREAM: 'remoteVoiceStream',
    USER_JOINED: 'userJoined',
    USER_LEFT: 'userLeft',
    DEVICE_CHANGE: 'devicechange',
    DEVICE_FALLBACK: 'devicefallback',
} as const;

// Plugin call API routes
export const CALL_TOKEN_API_PATH = 'livekit-token';
