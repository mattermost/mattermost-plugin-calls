export type UserState = {
    voice: boolean;
    unmuted: boolean;
    raised_hand: number;
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
    kind: string,
    packetsReceived: number,
    bytesReceived: number,
    packetsLost: number,
    packetsDiscarded: number,
    jitter: number,
    jitterBufferDelay: number,
}

export type RTCLocalOutboundStats = {
    kind: string,
    packetsSent: number,
    bytesSent: number,
    retransmittedPacketsSent: number,
    retransmittedBytesSent: number,
    nackCount: number,
    targetBitrate: number,
}

export type RTCRemoteInboundStats = {
    kind: string,
    packetsLost: number,
    fractionLost: number,
    jitter: number,
}

export type RTCRemoteOutboundStats = {
    kind: string,
    packetsSent: number,
    bytesSent: number,
}

export type CallsConfig = {
    ICEServers: string[],
    AllowEnableCalls: boolean,
    DefaultEnabled: boolean,
    MaxCallParticipants: number,
    sku_short_name: string,
    retrieved: boolean,
}

export const CallsConfigDefault = {
    ICEServers: [],
    AllowEnableCalls: false,
    DefaultEnabled: false,
    MaxCallParticipants: 0,
    sku_short_name: '',
    retrieved: false,
} as CallsConfig;

export type CallsClientConfig = {
    wsURL: string,
    iceServers: string[],
}
