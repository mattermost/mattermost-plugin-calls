import {
    CallAlertType,
    CallAlertConfig,
} from 'src/types/types';

export const CallAlertConfigs: {[key: string]: CallAlertConfig} = {
    missingAudioInput: {
        type: CallAlertType.Error,
        icon: 'microphone',
        text: 'Unable to find audio input device. Try plugging in the audio input device.',
    },
    missingScreenPermissions: {
        type: CallAlertType.Error,
        icon: 'monitor',
        text: 'Allow screen recording access to Mattermost in your system preferences.',
    },
};

