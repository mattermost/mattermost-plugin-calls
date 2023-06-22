import {defineMessage, MessageDescriptor} from 'react-intl';

import {CallAlertConfig, CallAlertType} from 'src/types/types';

export const MAX_NUM_REACTIONS_IN_REACTION_STREAM = 50;
export const REACTION_TIMEOUT_IN_REACTION_STREAM = 10000;
export const JOINED_USER_NOTIFICATION_TIMEOUT = 5000;
export const MAX_CHANNEL_LINK_TOOLTIP_NAMES = 8;

export const CallAlertConfigs: {[key: string]: CallAlertConfig} = {
    missingAudioInput: {
        type: CallAlertType.Error,
        icon: 'microphone',
        bannerText: defineMessage({defaultMessage: 'Unable to find a valid audio input device. Try plugging in an audio input device.'}),
        tooltipText: defineMessage({defaultMessage: 'No audio input devices'}),
        tooltipSubtext: defineMessage({defaultMessage: 'Try plugging in an audio input device.'}),
        dismissable: true,
    },
    missingAudioInputPermissions: {
        type: CallAlertType.Error,
        icon: 'microphone',
        bannerText: defineMessage({defaultMessage: 'Allow microphone access to Mattermost.'}),
        tooltipText: defineMessage({defaultMessage: 'No audio input permissions'}),
        tooltipSubtext: defineMessage({defaultMessage: 'Allow microphone access to Mattermost.'}),
        dismissable: true,
    },
    missingScreenPermissions: {
        type: CallAlertType.Error,
        icon: 'monitor',
        bannerText: defineMessage({defaultMessage: 'Screen recording access is not currently allowed or was cancelled.'}),
        tooltipText: defineMessage({defaultMessage: 'No screen sharing permissions'}),
        tooltipSubtext: defineMessage({defaultMessage: 'Allow screen recording access to Mattermost.'}),
        dismissable: true,
    },
    degradedCallQuality: {
        type: CallAlertType.Warning,
        icon: 'alert-outline',
        bannerText: defineMessage({defaultMessage: 'Call quality may be degraded due to unstable network conditions.'}),
        dismissable: false,
    },
};

export const CallRecordingDisclaimerStrings: {[key: string]: {[key: string]: MessageDescriptor}} = {
    host: {
        header: defineMessage({defaultMessage: 'You\'re recording'}),
        body: defineMessage({defaultMessage: 'You\'re recording this meeting. Consider letting everyone know that this meeting is being recorded.'}),
    },
    participant: {
        header: defineMessage({defaultMessage: 'Recording is in progress'}),
        body: defineMessage({defaultMessage: 'The host has started recording this meeting. By staying in the meeting you give consent to being recorded.'}),
    },
};

export const DisabledCallsErr = new Error('Cannot start or join call: calls are disabled in this channel.');

export const supportedLocales = [];
