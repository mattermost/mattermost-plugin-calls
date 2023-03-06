/// <reference types="node" />
import { EventEmitter } from 'events';
import { RTCPeerConfig } from './types';
export declare class RTCPeer extends EventEmitter {
    private pc;
    private readonly senders;
    private readonly logDebug;
    private readonly logErr;
    private readonly webrtc;
    private makingOffer;
    private candidates;
    connected: boolean;
    constructor(config: RTCPeerConfig);
    private onICECandidate;
    private onConnectionStateChange;
    private onICEConnectionStateChange;
    private onNegotiationNeeded;
    private onTrack;
    signal(data: string): Promise<void>;
    addTrack(track: MediaStreamTrack, stream: MediaStream): Promise<void>;
    addStream(stream: MediaStream): void;
    replaceTrack(oldTrackID: string, newTrack: MediaStreamTrack | null): void;
    getStats(): Promise<RTCStatsReport>;
    destroy(): void;
}
