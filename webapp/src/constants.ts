import {
    CallAlertType,
    CallAlertConfig,
} from 'src/types/types';

export const MAX_NUM_REACTIONS_IN_REACTION_STREAM = 50;
export const REACTION_TIMEOUT_IN_REACTION_STREAM = 10000;

export const CallAlertConfigs: {[key: string]: CallAlertConfig} = {
    missingAudioInput: {
        type: CallAlertType.Error,
        icon: 'microphone',
        bannerText: 'Unable to find a valid audio input device. Try plugging in an audio input device.',
        tooltipText: 'No audio input devices',
        tooltipSubtext: 'Try plugging in an audio input device.',
        dismissable: true,
    },
    missingAudioInputPermissions: {
        type: CallAlertType.Error,
        icon: 'microphone',
        bannerText: 'Allow microphone access to Mattermost.',
        tooltipText: 'No audio input permissions',
        tooltipSubtext: 'Allow microphone access to Mattermost.',
        dismissable: true,
    },
    missingScreenPermissions: {
        type: CallAlertType.Error,
        icon: 'monitor',
        bannerText: 'Screen recording access is not currently allowed or was cancelled.',
        tooltipText: 'No screen sharing permissions',
        tooltipSubtext: 'Allow screen recording access to Mattermost.',
        dismissable: true,
    },
    degradedCallQuality: {
        type: CallAlertType.Warning,
        icon: 'alert-outline',
        bannerText: 'Call quality may be degraded due to unstable network conditions.',
        dismissable: false,
    },
};

export const CallRecordingDisclaimerStrings: {[key: string]: {[key: string]: string}} = {
    host: {
        header: 'You are recording',
        body: 'You are recording this meeting. Consider letting everyone know that this meeting is being recorded.',
    },
    participant: {
        header: 'Recording is in progress',
        body: 'Host has started recording this meeting. By staying in the meeting you give consent to being recorded.',
    },
};
