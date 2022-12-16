// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

export type UserState = {
    id: string;
    voice: boolean;
    unmuted: boolean;
    raised_hand: number;
    reaction?: Reaction;
}

export type RTCStats = {
    [key: number]: {
        local: RTCLocalStats,
        remote: RTCRemoteStats,
    }
}

export type RTCLocalStats = {
    in?: RTCLocalInboundStats,
    out?: RTCLocalOutboundStats,
}

export type RTCRemoteStats = {
    in?: RTCRemoteInboundStats,
    out?: RTCRemoteOutboundStats,
}

export type RTCLocalInboundStats = {
    timestamp: number,
    kind: string,
    packetsReceived: number,
    bytesReceived: number,
    packetsLost: number,
    packetsDiscarded: number,
    jitter: number,
    jitterBufferDelay: number,
}

export type RTCLocalOutboundStats = {
    timestamp: number,
    kind: string,
    packetsSent: number,
    bytesSent: number,
    retransmittedPacketsSent: number,
    retransmittedBytesSent: number,
    nackCount: number,
    targetBitrate: number,
}

export type RTCRemoteInboundStats = {
    timestamp: number,
    kind: string,
    packetsLost: number,
    fractionLost: number,
    jitter: number,
    roundTripTime: number,
}

export type RTCRemoteOutboundStats = {
    timestamp: number,
    kind: string,
    packetsSent: number,
    bytesSent: number,
}

export type RTCCandidatePairStats = {
    timestamp: number,
    priority?: number,
    packetsSent: number,
    packetsReceived: number,
    currentRoundTripTime: number,
    totalRoundTripTime: number,
}

export type CallsConfig = {
    ICEServers: string[],
    ICEServersConfigs: RTCIceServer[],
    DefaultEnabled: boolean,
    MaxCallParticipants: number,
    NeedsTURNCredentials: boolean,
    AllowScreenSharing: boolean,
    EnableRecordings: boolean,
    MaxRecordingDuration: number,
    sku_short_name: string,
}

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
    id: string,
    enabled?: boolean,
}

export type CallsClientConfig = {
    wsURL: string,
    authToken?: string,
    iceServers: RTCIceServer[],
}

export type AudioDevices = {
    inputs: MediaDeviceInfo[],
    outputs: MediaDeviceInfo[],
}

export type TrackInfo = {
    id: string,
    streamID: string,
    kind: string,
    label: string,
    enabled: boolean,
    readyState: MediaStreamTrackState,
}

export type CallsClientStats = {
    initTime: number,
    callID: string,
    tracksInfo: TrackInfo[],
    rtcStats: RTCStats | null,
}

export type CallsUserPreferences = {
    joinSoundParticipantsThreshold: number,
}

export const CallsUserPreferencesDefault = {
    joinSoundParticipantsThreshold: 8,
};

export enum CallAlertType {
    Error = 'error',
    Warning = 'warning',
}

export type CallAlertConfig = {
    type: CallAlertType,
    icon: string,
    bannerText: string,
    tooltipText?: string,
    tooltipSubtext?: string,
    dismissable: boolean,
}

export type CallAlertState = {
    active: boolean,
    show: boolean,
}

export type CallAlertStates = {
    [key: string]: CallAlertState,
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

export type EmojiData = {
    name: string;
    skin?: string;
    unified: string;
}

export type Reaction = {
    emoji: EmojiData;
    timestamp: number;
    user_id: string;
    displayName: string;
}

export type CallRecordingState = {
    init_at: number,
    start_at: number,
    end_at: number,
    err?: string,
}

export type RTCMonitorConfig = {
    monitorInterval: number,
}
