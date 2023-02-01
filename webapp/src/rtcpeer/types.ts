export type RTCPeerConfig = {
    iceServers: RTCIceServer[],
}

export enum SimulcastLevel {
    High = 'h',
    Medium = 'm',
    Low = 'l',
}
