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
