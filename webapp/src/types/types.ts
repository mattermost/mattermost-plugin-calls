// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {MessageDescriptor} from 'react-intl';

import {CallsConfig, RTCStats} from '@calls/common/lib/types';

export const CallsConfigDefault: CallsConfig = {
    ICEServers: [],
    ICEServersConfigs: [],
    DefaultEnabled: false,
    MaxCallParticipants: 0,
    NeedsTURNCredentials: false,
    AllowScreenSharing: true,
    EnableRecordings: false,
    MaxRecordingDuration: 60,
    sku_short_name: '',
};

export type ChannelState = {
    id: string;
    enabled?: boolean;
}

export type CallsClientConfig = {
    wsURL: string;
    authToken?: string;
    iceServers: RTCIceServer[];
}

export type AudioDevices = {
    inputs: MediaDeviceInfo[];
    outputs: MediaDeviceInfo[];
}

export type TrackInfo = {
    id: string;
    streamID: string;
    kind: string;
    label: string;
    enabled: boolean;
    readyState: MediaStreamTrackState;
}

export type CallsClientStats = {
    initTime: number;
    callID: string;
    tracksInfo: TrackInfo[];
    rtcStats: RTCStats | null;
}

export type CallsUserPreferences = {
    joinSoundParticipantsThreshold: number;
}

export const CallsUserPreferencesDefault = {
    joinSoundParticipantsThreshold: 8,
};

export enum CallAlertType {
    Error = 'error',
    Warning = 'warning',
}

export type CallAlertConfig = {
    type: CallAlertType;
    icon: string;
    bannerText: MessageDescriptor;
    tooltipText: MessageDescriptor;
    tooltipSubtext: MessageDescriptor;
}

export type CallAlertState = {
    active: boolean;
    show: boolean;
}

export type CallAlertStates = {
    [key: string]: CallAlertState;
}

export const CallAlertStatesDefault = {
    missingAudioInput: {
        active: false,
        show: false,
    },
    missingAudioInputPermissions: {
        active: false,
        show: false,
    },
    missingScreenPermissions: {
        active: false,
        show: false,
    },
};

export type CapturerSource = {
    id: string;
    name: string;
    thumbnailURL: string;
    display_id: string;
}

export type ColorRGB = {
    r: number,
    g: number,
    b: number,
};

export type ColorHSL = {
    h: number,
    s: number,
    l: number,
};
