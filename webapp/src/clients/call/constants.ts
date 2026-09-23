// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {AudioCaptureOptions, AudioPresets, ConnectionQuality, TrackPublishDefaults} from 'livekit-client';

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
    RAISE_HAND: 'raiseHand',
    LOWER_HAND: 'lowerHand',
    REACTION: 'reaction',

    // CALL_STATE is the full snapshot returned by the join request. It arrives
    // before the room connects, so consumers can seed their store knowing no
    // LiveKit-sourced state has been emitted yet.
    CALL_STATE: 'callState',

    // Call-level state that LiveKit cannot supply on its own, delivered through
    // room metadata: on connect and again on every change.
    HOST_CHANGED: 'hostChanged',
    JOB_STATE: 'jobState',

    // SCREEN_SHARING_CHANGED carries the single derived screen sharer, or null
    // when nobody is sharing. Recomputed from LiveKit track state on every
    // screen event rather than assigned per event, so it is order-independent
    // and self-healing.
    SCREEN_SHARING_CHANGED: 'screenSharingChanged',
} as const;

export const CALL_ATTRIBUTES = {
    RAISED_HAND: 'raised_hand',

    // BOT marks the recording/transcribing bot. Server-set on the bot's LiveKit
    // token grant (see livekitAttributeBot server-side); used to filter the bot
    // out of the participant list regardless of how participants are discovered.
    BOT: 'bot',
} as const;

export const CALL_MESSAGE_TOPICS = {
    REACTION: 'reaction',

    // HOST_CONTROL carries host commands the server cannot enforce through the
    // LiveKit admin API. Sent by the server, so these messages have no sending
    // participant. Mirrors livekitTopicHostControl server-side.
    HOST_CONTROL: 'host_control',
} as const;

/**
 * Actions carried by a HOST_CONTROL message.
 *
 * Stopping a screen share is the only one today: MutePublishedTrack leaves the
 * capture running and the browser's sharing indicator lit, so only the client
 * can actually tear the track down.
 */
export const HOST_CONTROL_ACTIONS = {
    STOP_SCREENSHARE: 'stop_screenshare',
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
