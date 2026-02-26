// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {defineMessage, MessageDescriptor} from 'react-intl';
import {CallAlertConfig, CallAlertType} from 'src/types/types';

export const MAX_NUM_REACTIONS_IN_REACTION_STREAM = 50;
export const REACTION_TIMEOUT_IN_REACTION_STREAM = 10000;
export const JOINED_USER_NOTIFICATION_TIMEOUT = 5000;
export const MAX_CHANNEL_LINK_TOOLTIP_NAMES = 8;
export const RING_LENGTH = 30000;
export const DEFAULT_RING_SOUND = 'Calm';
export const CALL_START_POST_TYPE = 'custom_calls';
export const CALL_RECORDING_POST_TYPE = 'custom_calls_recording';
export const CALL_TRANSCRIPTION_POST_TYPE = 'custom_calls_transcription';
export const LIVE_CAPTION_TIMEOUT = 5000;
export const HOST_CONTROL_NOTICE_TIMEOUT = 5000;
export const DEGRADED_CALL_QUALITY_ALERT_WAIT = 20000;

// From mattermost-webapp/webapp/channels/src/utils/constants.tsx, importing causes tsc to throw fits.
export const MESSAGE_DISPLAY = 'message_display';
export const MESSAGE_DISPLAY_COMPACT = 'compact';
export const MESSAGE_DISPLAY_DEFAULT = 'clean';

// The JobTypes from server/public/job.go
export const JOB_TYPE_RECORDING = 'recording';
export const JOB_TYPE_TRANSCRIBING = 'transcribing';
export const JOB_TYPE_CAPTIONING = 'captioning';

export const CallAlertConfigs: { [key: string]: CallAlertConfig } = {
    missingAudioInput: {
        type: CallAlertType.Error,
        icon: 'microphone-off',
        bannerText: defineMessage({defaultMessage: 'Unable to find a valid audio input device. Try plugging in an audio input device.'}),
        tooltipText: defineMessage({defaultMessage: 'No audio input devices'}),
        tooltipSubtext: defineMessage({defaultMessage: 'Try plugging in an audio input device.'}),
        dismissable: true,
    },
    missingAudioInputPermissions: {
        type: CallAlertType.Error,
        icon: 'microphone-off',
        bannerText: defineMessage({defaultMessage: 'Allow microphone access to Mattermost.'}),
        tooltipText: defineMessage({defaultMessage: 'No audio input permissions'}),
        tooltipSubtext: defineMessage({defaultMessage: 'Allow microphone access to Mattermost.'}),
        dismissable: true,
    },
    missingVideoInput: {
        type: CallAlertType.Error,
        icon: 'video-off-outline',
        bannerText: defineMessage({defaultMessage: 'Unable to find a valid video input device. Try plugging in a video input device.'}),
        tooltipText: defineMessage({defaultMessage: 'No video input devices'}),
        tooltipSubtext: defineMessage({defaultMessage: 'Try plugging in a video input device.'}),
        dismissable: true,
    },
    missingVideoInputPermissions: {
        type: CallAlertType.Error,
        icon: 'video-off-outline',
        bannerText: defineMessage({defaultMessage: 'Allow camera access to Mattermost.'}),
        tooltipText: defineMessage({defaultMessage: 'No video input permissions'}),
        tooltipSubtext: defineMessage({defaultMessage: 'Allow camera access to Mattermost.'}),
        dismissable: true,
    },
    missingScreenPermissions: {
        type: CallAlertType.Error,
        icon: 'monitor-off',
        bannerText: defineMessage({defaultMessage: 'Screen recording access is not currently allowed or was canceled.'}),
        tooltipText: defineMessage({defaultMessage: 'No screen sharing permissions'}),
        tooltipSubtext: defineMessage({defaultMessage: 'Allow screen recording access to Mattermost.'}),
        dismissable: true,
    },
    degradedCallQuality: {
        type: CallAlertType.Warning,
        icon: 'alert-outline',
        bannerText: defineMessage({defaultMessage: 'Call quality may be degraded due to unstable network conditions.'}),
        dismissable: true,
    },
    audioInputDeviceFallback: {
        type: CallAlertType.Info,
        icon: 'microphone',
        bannerText: defineMessage({defaultMessage: 'The audio input device has changed to <i>{deviceLabel}</i>.'}),
        dismissable: true,
    },
    audioOutputDeviceFallback: {
        type: CallAlertType.Info,
        icon: 'speaker',
        bannerText: defineMessage({defaultMessage: 'The audio output device has changed to <i>{deviceLabel}</i>.'}),
        dismissable: true,
    },
};

export const CallRecordingDisclaimerStrings: {[key: string]: {[key: string]: MessageDescriptor}} = {
    host: {
        header: defineMessage({defaultMessage: 'You\'re recording'}),
        body: defineMessage({defaultMessage: 'Consider letting everyone know that this meeting is being recorded.'}),
    },
    participant: {
        header: defineMessage({defaultMessage: 'Recording is in progress'}),
        body: defineMessage({defaultMessage: 'The host has started recording this meeting. By staying in the meeting, you give consent to being recorded.'}),
    },
};

export const CallTranscribingDisclaimerStrings: {[key: string]: {[key: string]: MessageDescriptor}} = {
    host: {
        header: defineMessage({defaultMessage: 'Recording and transcription has started'}),
        body: defineMessage({defaultMessage: 'Consider letting everyone know that this meeting is being recorded and transcribed.'}),
    },
    participant: {
        header: defineMessage({defaultMessage: 'Recording and transcription is in progress'}),
        body: defineMessage({defaultMessage: 'The host has started recording and transcription for this meeting. By staying in the meeting, you give consent to being recorded and transcribed.'}),
    },
};

export const DisabledCallsErr = new Error('Cannot start or join call: calls are disabled in this channel.');

export const supportedLocales = [];

// Local/Session storage keys
export const STORAGE_CALLS_CLIENT_STATS_KEY = 'calls_client_stats';
export const STORAGE_CALLS_CLIENT_LOGS_KEY = 'calls_client_logs';
export const STORAGE_CALLS_DEFAULT_AUDIO_INPUT_KEY = 'calls_default_audio_input';
export const STORAGE_CALLS_DEFAULT_AUDIO_OUTPUT_KEY = 'calls_default_audio_output';
export const STORAGE_CALLS_SHARE_AUDIO_WITH_SCREEN = 'calls_share_audio_with_screen';
export const STORAGE_CALLS_DEFAULT_VIDEO_INPUT_KEY = 'calls_default_video_input';
export const STORAGE_CALLS_EXPERIMENTAL_FEATURES_KEY = 'calls_experimental_features';
export const STORAGE_CALLS_MIRROR_VIDEO_KEY = 'calls_mirror_video';
export const STORAGE_CALLS_BLUR_BACKGROUND_KEY = 'calls_blur_background';

// Log buffer size limits
export const MAX_ACCUMULATED_LOG_SIZE = 1024 * 1024; // 1 MB
export const MAX_INLINE_LOG_POST_SIZE = 200 * 1024; // 200 KB
