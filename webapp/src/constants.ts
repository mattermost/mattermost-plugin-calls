import {
    CallAlertType,
    CallAlertConfig,
} from 'src/types/types';

export const CallAlertConfigs: {[key: string]: CallAlertConfig} = {
    missingAudioInput: {
        type: CallAlertType.Error,
        icon: 'microphone',
        bannerText: 'Unable to find a valid audio input device. Try plugging in an audio input device.',
        tooltipText: 'No audio input devices',
        tooltipSubtext: 'Try plugging in an audio input device',
    },
    missingAudioInputPermissions: {
        type: CallAlertType.Error,
        icon: 'microphone',
        bannerText: 'Allow microphone access to Mattermost.',
        tooltipText: 'No audio input permissions',
        tooltipSubtext: 'Allow microphone access to Mattermost',
    },
    missingScreenPermissions: {
        type: CallAlertType.Error,
        icon: 'monitor',
        bannerText: 'Allow screen recording access to Mattermost in your system preferences.',
        tooltipText: 'No screen-sharing permissions',
        tooltipSubtext: 'Allow screen recording access to Mattermost.',
    },
};

