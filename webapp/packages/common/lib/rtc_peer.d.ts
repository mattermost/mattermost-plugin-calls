/// <reference types="node" />
import { EventEmitter } from 'events';
import type { RTCPeerConfig, MediaStreamTrack, MediaStream } from './types';
export declare class RTCPeer extends EventEmitter {
    private pc;
    private readonly senders;
    private readonly logDebug;
    private makingOffer;
    connected: boolean;
    constructor(config: RTCPeerConfig, logDebug: (...args: unknown[]) => void);
    private onICECandidate;
    private onConnectionStateChange;
    private onICEConnectionStateChange;
    private onNegotiationNeeded;
    private onTrack;
    signal(data: string): Promise<void>;
    addTrack(track: MediaStreamTrack, stream: MediaStream): Promise<void>;
    addStream(stream: MediaStream): void;
    replaceTrack(oldTrackID: string, newTrack: MediaStreamTrack | null): void;
    getStats(): Promise<import("./types").RTCStatsReport>;
    destroy(): void;
}
