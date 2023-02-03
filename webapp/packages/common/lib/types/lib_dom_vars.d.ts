import type { RTCPeerConnection as RTCPeerConnectionType, RTCConfiguration, AlgorithmIdentifier, RTCCertificate, MediaStream as MediaStreamType, MediaStreamTrack } from './lib_dom';
export declare var RTCPeerConnection: {
    prototype: RTCPeerConnectionType;
    new (configuration?: RTCConfiguration): RTCPeerConnectionType;
    generateCertificate(keygenAlgorithm: AlgorithmIdentifier): Promise<RTCCertificate>;
};
export declare var MediaStream: {
    prototype: MediaStreamType;
    new (): MediaStreamType;
    new (stream: MediaStreamType): MediaStreamType;
    new (tracks: MediaStreamTrack[]): MediaStreamType;
};
