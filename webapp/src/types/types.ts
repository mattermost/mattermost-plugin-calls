// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {CallsConfig, RTCStats} from '@calls/common/lib/types';
import {MessageDescriptor} from 'react-intl';

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
    EnableSimulcast: false,
    EnableRinging: true,
};

export type ChannelState = {
    id: string;
    enabled?: boolean;
}

export type CallsClientConfig = {
    wsURL: string;
    authToken?: string;
    iceServers: RTCIceServer[];
    simulcast?: boolean;
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
    tooltipText?: MessageDescriptor;
    tooltipSubtext?: MessageDescriptor;
    dismissable: boolean;
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
    degradedCallQuality: {
        active: false,
        show: false,
    },
};

export type CallRecordingReduxState = {
    init_at: number;
    start_at: number;
    end_at: number;
    err?: string;
    error_at?: number;
    prompt_dismissed_at?: number;
}

export type CapturerSource = {
    id: string;
    name: string;
    thumbnailURL: string;
    display_id: string;
}

// currentCallData (of type CurrentCallData) is attached to the widget's window to keep persistent data across
// the various call windows. As a simple rule, if a child window (eg, ExpandedViewWindow) sets data,
// set it directly in the window.opener.currentCallData, and read that data when needing up-to-date
// data. The widget needs to set/read data on its window.currentCallData object.
// Reminder: obviously this is not reactive; setting data will not update the other window.
export type CurrentCallData = {
    recordingPromptDismissedAt: number;
}

export const CurrentCallDataDefault: CurrentCallData = {
    recordingPromptDismissedAt: 0,
};

// Similar to currentCallData, callActions is a cross-window function to trigger a change in that
// owning window. recordingPromptDismissedAt should be set by that window's init function or constructor.
export type CallActions = {
    setRecordingPromptDismissedAt: (callId: string, dismissedAt: number) => void;
}

export enum ChannelType {
    DM,
    GM
}

export type IncomingCallNotification = {
    callID: string;
    channelID: string;
    hostID: string;
    startAt: number;
    type: ChannelType;
}
