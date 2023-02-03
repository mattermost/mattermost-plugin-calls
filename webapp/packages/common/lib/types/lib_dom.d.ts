export interface RTCStatsReport {
    forEach(callbackfn: (value: any, key: string, parent: RTCStatsReport) => void, thisArg?: any): void;
}
export interface RTCPeerConnection extends EventTarget {
    readonly canTrickleIceCandidates: boolean | null;
    readonly connectionState: RTCPeerConnectionState;
    readonly currentLocalDescription: RTCSessionDescription | null;
    readonly currentRemoteDescription: RTCSessionDescription | null;
    readonly iceConnectionState: RTCIceConnectionState;
    readonly iceGatheringState: RTCIceGatheringState;
    readonly localDescription: RTCSessionDescription | null;
    onconnectionstatechange: ((this: RTCPeerConnection, ev: Event) => any) | null;
    ondatachannel: ((this: RTCPeerConnection, ev: RTCDataChannelEvent) => any) | null;
    onicecandidate: ((this: RTCPeerConnection, ev: RTCPeerConnectionIceEvent) => any) | null;
    onicecandidateerror: ((this: RTCPeerConnection, ev: Event) => any) | null;
    oniceconnectionstatechange: ((this: RTCPeerConnection, ev: Event) => any) | null;
    onicegatheringstatechange: ((this: RTCPeerConnection, ev: Event) => any) | null;
    onnegotiationneeded: ((this: RTCPeerConnection, ev: Event) => any) | null;
    onsignalingstatechange: ((this: RTCPeerConnection, ev: Event) => any) | null;
    ontrack: ((this: RTCPeerConnection, ev: RTCTrackEvent) => any) | null;
    readonly pendingLocalDescription: RTCSessionDescription | null;
    readonly pendingRemoteDescription: RTCSessionDescription | null;
    readonly remoteDescription: RTCSessionDescription | null;
    readonly sctp: RTCSctpTransport | null;
    readonly signalingState: RTCSignalingState;
    addIceCandidate(candidate?: RTCIceCandidateInit): Promise<void>;
    /** @deprecated */
    addIceCandidate(candidate: RTCIceCandidateInit, successCallback: VoidFunction, failureCallback: RTCPeerConnectionErrorCallback): Promise<void>;
    addTrack(track: MediaStreamTrack, ...streams: MediaStream[]): RTCRtpSender;
    addTransceiver(trackOrKind: MediaStreamTrack | string, init?: RTCRtpTransceiverInit): RTCRtpTransceiver;
    close(): void;
    createAnswer(options?: RTCAnswerOptions): Promise<RTCSessionDescriptionInit>;
    /** @deprecated */
    createAnswer(successCallback: RTCSessionDescriptionCallback, failureCallback: RTCPeerConnectionErrorCallback): Promise<void>;
    createDataChannel(label: string, dataChannelDict?: RTCDataChannelInit): RTCDataChannel;
    createOffer(options?: RTCOfferOptions): Promise<RTCSessionDescriptionInit>;
    /** @deprecated */
    createOffer(successCallback: RTCSessionDescriptionCallback, failureCallback: RTCPeerConnectionErrorCallback, options?: RTCOfferOptions): Promise<void>;
    getConfiguration(): RTCConfiguration;
    getReceivers(): RTCRtpReceiver[];
    getSenders(): RTCRtpSender[];
    getStats(selector?: MediaStreamTrack | null): Promise<RTCStatsReport>;
    getTransceivers(): RTCRtpTransceiver[];
    removeTrack(sender: RTCRtpSender): void;
    restartIce(): void;
    setConfiguration(configuration?: RTCConfiguration): void;
    setLocalDescription(description?: RTCLocalSessionDescriptionInit): Promise<void>;
    /** @deprecated */
    setLocalDescription(description: RTCLocalSessionDescriptionInit, successCallback: VoidFunction, failureCallback: RTCPeerConnectionErrorCallback): Promise<void>;
    setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void>;
    /** @deprecated */
    setRemoteDescription(description: RTCSessionDescriptionInit, successCallback: VoidFunction, failureCallback: RTCPeerConnectionErrorCallback): Promise<void>;
    addEventListener<K extends keyof RTCPeerConnectionEventMap>(type: K, listener: (this: RTCPeerConnection, ev: RTCPeerConnectionEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
    removeEventListener<K extends keyof RTCPeerConnectionEventMap>(type: K, listener: (this: RTCPeerConnection, ev: RTCPeerConnectionEventMap[K]) => any, options?: boolean | EventListenerOptions): void;
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
}
export interface RTCRtpSender {
    readonly dtmf: RTCDTMFSender | null;
    readonly track: MediaStreamTrack | null;
    readonly transport: RTCDtlsTransport | null;
    getParameters(): RTCRtpSendParameters;
    getStats(): Promise<RTCStatsReport>;
    replaceTrack(withTrack: MediaStreamTrack | null): Promise<void>;
    setParameters(parameters: RTCRtpSendParameters): Promise<void>;
    setStreams(...streams: MediaStream[]): void;
}
export interface RTCPeerConnectionIceEvent extends Event {
    readonly candidate: RTCIceCandidate | null;
}
export interface RTCTrackEvent extends Event {
    readonly receiver: RTCRtpReceiver;
    readonly streams: ReadonlyArray<MediaStream>;
    readonly track: MediaStreamTrack;
    readonly transceiver: RTCRtpTransceiver;
}
export interface RTCIceServer {
    credential?: string;
    urls: string | string[];
    username?: string;
}
export interface MediaStreamTrack extends EventTarget {
    contentHint: string;
    enabled: boolean;
    readonly id: string;
    readonly kind: string;
    readonly label: string;
    readonly muted: boolean;
    onended: ((this: MediaStreamTrack, ev: Event) => any) | null;
    onmute: ((this: MediaStreamTrack, ev: Event) => any) | null;
    onunmute: ((this: MediaStreamTrack, ev: Event) => any) | null;
    readonly readyState: MediaStreamTrackState;
    applyConstraints(constraints?: MediaTrackConstraints): Promise<void>;
    clone(): MediaStreamTrack;
    getCapabilities(): MediaTrackCapabilities;
    getConstraints(): MediaTrackConstraints;
    getSettings(): MediaTrackSettings;
    stop(): void;
    addEventListener<K extends keyof MediaStreamTrackEventMap>(type: K, listener: (this: MediaStreamTrack, ev: MediaStreamTrackEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
    removeEventListener<K extends keyof MediaStreamTrackEventMap>(type: K, listener: (this: MediaStreamTrack, ev: MediaStreamTrackEventMap[K]) => any, options?: boolean | EventListenerOptions): void;
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
}
export interface MediaStream extends EventTarget {
    readonly active: boolean;
    readonly id: string;
    onaddtrack: ((this: MediaStream, ev: MediaStreamTrackEvent) => any) | null;
    onremovetrack: ((this: MediaStream, ev: MediaStreamTrackEvent) => any) | null;
    addTrack(track: MediaStreamTrack): void;
    clone(): MediaStream;
    getAudioTracks(): MediaStreamTrack[];
    getTrackById(trackId: string): MediaStreamTrack | null;
    getTracks(): MediaStreamTrack[];
    getVideoTracks(): MediaStreamTrack[];
    removeTrack(track: MediaStreamTrack): void;
    addEventListener<K extends keyof MediaStreamEventMap>(type: K, listener: (this: MediaStream, ev: MediaStreamEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
    removeEventListener<K extends keyof MediaStreamEventMap>(type: K, listener: (this: MediaStream, ev: MediaStreamEventMap[K]) => any, options?: boolean | EventListenerOptions): void;
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
}
export interface MediaDeviceInfo {
    readonly deviceId: string;
    readonly groupId: string;
    readonly kind: MediaDeviceKind;
    readonly label: string;
    toJSON(): any;
}
export type MediaStreamTrackState = 'ended' | 'live';
type MediaDeviceKind = 'audioinput' | 'audiooutput' | 'videoinput';
type RTCBundlePolicy = 'balanced' | 'max-bundle' | 'max-compat';
type RTCDataChannelState = 'closed' | 'closing' | 'connecting' | 'open';
type RTCDegradationPreference = 'balanced' | 'maintain-framerate' | 'maintain-resolution';
type RTCDtlsTransportState = 'closed' | 'connected' | 'connecting' | 'failed' | 'new';
type RTCIceCandidateType = 'host' | 'prflx' | 'relay' | 'srflx';
type RTCIceComponent = 'rtcp' | 'rtp';
type RTCIceConnectionState = 'checking' | 'closed' | 'completed' | 'connected' | 'disconnected' | 'failed' | 'new';
type RTCIceGatheringState = 'complete' | 'gathering' | 'new';
type RTCIceProtocol = 'tcp' | 'udp';
type RTCIceTcpCandidateType = 'active' | 'passive' | 'so';
type RTCIceTransportPolicy = 'all' | 'relay';
type RTCPeerConnectionState = 'closed' | 'connected' | 'connecting' | 'disconnected' | 'failed' | 'new';
type RTCRtcpMuxPolicy = 'require';
type RTCRtpTransceiverDirection = 'inactive' | 'recvonly' | 'sendonly' | 'sendrecv' | 'stopped';
type RTCSctpTransportState = 'closed' | 'connected' | 'connecting';
type RTCSdpType = 'answer' | 'offer' | 'pranswer' | 'rollback';
type RTCSignalingState = 'closed' | 'have-local-offer' | 'have-local-pranswer' | 'have-remote-offer' | 'have-remote-pranswer' | 'stable';
interface RTCSessionDescription {
    readonly sdp: string;
    readonly type: RTCSdpType;
    toJSON(): any;
}
interface RTCDataChannelEvent extends Event {
    readonly channel: RTCDataChannel;
}
interface RTCSctpTransport extends EventTarget {
    readonly maxChannels: number | null;
    readonly maxMessageSize: number;
    onstatechange: ((this: RTCSctpTransport, ev: Event) => any) | null;
    readonly state: RTCSctpTransportState;
    readonly transport: RTCDtlsTransport;
    addEventListener<K extends keyof RTCSctpTransportEventMap>(type: K, listener: (this: RTCSctpTransport, ev: RTCSctpTransportEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
    removeEventListener<K extends keyof RTCSctpTransportEventMap>(type: K, listener: (this: RTCSctpTransport, ev: RTCSctpTransportEventMap[K]) => any, options?: boolean | EventListenerOptions): void;
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
}
interface RTCIceCandidateInit {
    candidate?: string;
    sdpMLineIndex?: number | null;
    sdpMid?: string | null;
    usernameFragment?: string | null;
}
interface RTCPeerConnectionErrorCallback {
    (error: DOMException): void;
}
interface RTCRtpTransceiverInit {
    direction?: RTCRtpTransceiverDirection;
    sendEncodings?: RTCRtpEncodingParameters[];
    streams?: MediaStream[];
}
interface RTCRtpTransceiver {
    readonly currentDirection: RTCRtpTransceiverDirection | null;
    direction: RTCRtpTransceiverDirection;
    readonly mid: string | null;
    readonly receiver: RTCRtpReceiver;
    readonly sender: RTCRtpSender;
    setCodecPreferences(codecs: RTCRtpCodecCapability[]): void;
    stop(): void;
}
interface RTCRtpCodecCapability {
    channels?: number;
    clockRate: number;
    mimeType: string;
    sdpFmtpLine?: string;
}
interface RTCOfferAnswerOptions {
}
type RTCAnswerOptions = RTCOfferAnswerOptions;
interface RTCSessionDescriptionInit {
    sdp?: string;
    type: RTCSdpType;
}
interface RTCSessionDescriptionCallback {
    (description: RTCSessionDescriptionInit): void;
}
interface RTCDataChannelInit {
    id?: number;
    maxPacketLifeTime?: number;
    maxRetransmits?: number;
    negotiated?: boolean;
    ordered?: boolean;
    protocol?: string;
}
interface RTCDataChannel extends EventTarget {
    binaryType: BinaryType;
    readonly bufferedAmount: number;
    bufferedAmountLowThreshold: number;
    readonly id: number | null;
    readonly label: string;
    readonly maxPacketLifeTime: number | null;
    readonly maxRetransmits: number | null;
    readonly negotiated: boolean;
    onbufferedamountlow: ((this: RTCDataChannel, ev: Event) => any) | null;
    onclose: ((this: RTCDataChannel, ev: Event) => any) | null;
    onclosing: ((this: RTCDataChannel, ev: Event) => any) | null;
    onerror: ((this: RTCDataChannel, ev: Event) => any) | null;
    onmessage: ((this: RTCDataChannel, ev: MessageEvent) => any) | null;
    onopen: ((this: RTCDataChannel, ev: Event) => any) | null;
    readonly ordered: boolean;
    readonly protocol: string;
    readonly readyState: RTCDataChannelState;
    close(): void;
    send(data: string): void;
    send(data: Blob): void;
    send(data: ArrayBuffer): void;
    send(data: ArrayBufferView): void;
    addEventListener<K extends keyof RTCDataChannelEventMap>(type: K, listener: (this: RTCDataChannel, ev: RTCDataChannelEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
    removeEventListener<K extends keyof RTCDataChannelEventMap>(type: K, listener: (this: RTCDataChannel, ev: RTCDataChannelEventMap[K]) => any, options?: boolean | EventListenerOptions): void;
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
}
interface RTCOfferOptions extends RTCOfferAnswerOptions {
    iceRestart?: boolean;
    offerToReceiveAudio?: boolean;
    offerToReceiveVideo?: boolean;
}
export interface RTCConfiguration {
    bundlePolicy?: RTCBundlePolicy;
    certificates?: RTCCertificate[];
    iceCandidatePoolSize?: number;
    iceServers?: RTCIceServer[];
    iceTransportPolicy?: RTCIceTransportPolicy;
    rtcpMuxPolicy?: RTCRtcpMuxPolicy;
}
interface RTCRtpCodecParameters {
    channels?: number;
    clockRate: number;
    mimeType: string;
    payloadType: number;
    sdpFmtpLine?: string;
}
interface RTCRtpHeaderExtensionParameters {
    encrypted?: boolean;
    id: number;
    uri: string;
}
interface RTCRtcpParameters {
    cname?: string;
    reducedSize?: boolean;
}
interface RTCRtpParameters {
    codecs: RTCRtpCodecParameters[];
    headerExtensions: RTCRtpHeaderExtensionParameters[];
    rtcp: RTCRtcpParameters;
}
type RTCRtpReceiveParameters = RTCRtpParameters;
type RTCRtpSynchronizationSource = RTCRtpContributingSource;
interface RTCRtpReceiver {
    readonly track: MediaStreamTrack;
    readonly transport: RTCDtlsTransport | null;
    getContributingSources(): RTCRtpContributingSource[];
    getParameters(): RTCRtpReceiveParameters;
    getStats(): Promise<RTCStatsReport>;
    getSynchronizationSources(): RTCRtpSynchronizationSource[];
}
interface RTCLocalSessionDescriptionInit {
    sdp?: string;
    type?: RTCSdpType;
}
interface RTCPeerConnectionEventMap {
    'connectionstatechange': Event;
    'datachannel': RTCDataChannelEvent;
    'icecandidate': RTCPeerConnectionIceEvent;
    'icecandidateerror': Event;
    'iceconnectionstatechange': Event;
    'icegatheringstatechange': Event;
    'negotiationneeded': Event;
    'signalingstatechange': Event;
    'track': RTCTrackEvent;
}
interface RTCDTMFToneChangeEvent extends Event {
    readonly tone: string;
}
interface RTCDTMFSenderEventMap {
    'tonechange': RTCDTMFToneChangeEvent;
}
interface RTCDTMFSender extends EventTarget {
    readonly canInsertDTMF: boolean;
    ontonechange: ((this: RTCDTMFSender, ev: RTCDTMFToneChangeEvent) => any) | null;
    readonly toneBuffer: string;
    insertDTMF(tones: string, duration?: number, interToneGap?: number): void;
    addEventListener<K extends keyof RTCDTMFSenderEventMap>(type: K, listener: (this: RTCDTMFSender, ev: RTCDTMFSenderEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
    removeEventListener<K extends keyof RTCDTMFSenderEventMap>(type: K, listener: (this: RTCDTMFSender, ev: RTCDTMFSenderEventMap[K]) => any, options?: boolean | EventListenerOptions): void;
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
}
interface RTCDtlsTransport extends EventTarget {
    readonly iceTransport: RTCIceTransport;
    onerror: ((this: RTCDtlsTransport, ev: Event) => any) | null;
    onstatechange: ((this: RTCDtlsTransport, ev: Event) => any) | null;
    readonly state: RTCDtlsTransportState;
    getRemoteCertificates(): ArrayBuffer[];
    addEventListener<K extends keyof RTCDtlsTransportEventMap>(type: K, listener: (this: RTCDtlsTransport, ev: RTCDtlsTransportEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
    removeEventListener<K extends keyof RTCDtlsTransportEventMap>(type: K, listener: (this: RTCDtlsTransport, ev: RTCDtlsTransportEventMap[K]) => any, options?: boolean | EventListenerOptions): void;
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
}
interface RTCRtpSendParameters extends RTCRtpParameters {
    degradationPreference?: RTCDegradationPreference;
    encodings: RTCRtpEncodingParameters[];
    transactionId: string;
}
interface RTCIceCandidate {
    readonly address: string | null;
    readonly candidate: string;
    readonly component: RTCIceComponent | null;
    readonly foundation: string | null;
    readonly port: number | null;
    readonly priority: number | null;
    readonly protocol: RTCIceProtocol | null;
    readonly relatedAddress: string | null;
    readonly relatedPort: number | null;
    readonly sdpMLineIndex: number | null;
    readonly sdpMid: string | null;
    readonly tcpType: RTCIceTcpCandidateType | null;
    readonly type: RTCIceCandidateType | null;
    readonly usernameFragment: string | null;
    toJSON(): RTCIceCandidateInit;
}
interface MediaTrackConstraints extends MediaTrackConstraintSet {
    advanced?: MediaTrackConstraintSet[];
}
interface MediaTrackConstraintSet {
    aspectRatio?: ConstrainDouble;
    autoGainControl?: ConstrainBoolean;
    channelCount?: ConstrainULong;
    deviceId?: ConstrainDOMString;
    echoCancellation?: ConstrainBoolean;
    facingMode?: ConstrainDOMString;
    frameRate?: ConstrainDouble;
    groupId?: ConstrainDOMString;
    height?: ConstrainULong;
    latency?: ConstrainDouble;
    noiseSuppression?: ConstrainBoolean;
    sampleRate?: ConstrainULong;
    sampleSize?: ConstrainULong;
    suppressLocalAudioPlayback?: ConstrainBoolean;
    width?: ConstrainULong;
}
type ConstrainDOMString = string | string[] | ConstrainDOMStringParameters;
interface ConstrainDOMStringParameters {
    exact?: string | string[];
    ideal?: string | string[];
}
type ConstrainULong = number | ConstrainULongRange;
interface ConstrainULongRange extends ULongRange {
    exact?: number;
    ideal?: number;
}
type ConstrainDouble = number | ConstrainDoubleRange;
interface DoubleRange {
    max?: number;
    min?: number;
}
interface ConstrainDoubleRange extends DoubleRange {
    exact?: number;
    ideal?: number;
}
type ConstrainBoolean = boolean | ConstrainBooleanParameters;
interface ConstrainBooleanParameters {
    exact?: boolean;
    ideal?: boolean;
}
interface ULongRange {
    max?: number;
    min?: number;
}
interface MediaTrackCapabilities {
    aspectRatio?: DoubleRange;
    autoGainControl?: boolean[];
    channelCount?: ULongRange;
    cursor?: string[];
    deviceId?: string;
    displaySurface?: string;
    echoCancellation?: boolean[];
    facingMode?: string[];
    frameRate?: DoubleRange;
    groupId?: string;
    height?: ULongRange;
    latency?: DoubleRange;
    logicalSurface?: boolean;
    noiseSuppression?: boolean[];
    resizeMode?: string[];
    sampleRate?: ULongRange;
    sampleSize?: ULongRange;
    width?: ULongRange;
}
interface MediaTrackSettings {
    aspectRatio?: number;
    autoGainControl?: boolean;
    deviceId?: string;
    echoCancellation?: boolean;
    facingMode?: string;
    frameRate?: number;
    groupId?: string;
    height?: number;
    noiseSuppression?: boolean;
    restrictOwnAudio?: boolean;
    sampleRate?: number;
    sampleSize?: number;
    width?: number;
}
interface MediaStreamTrackEventMap {
    'ended': Event;
    'mute': Event;
    'unmute': Event;
}
interface MediaStreamTrackEvent extends Event {
    readonly track: MediaStreamTrack;
}
interface MediaStreamEventMap {
    'addtrack': MediaStreamTrackEvent;
    'removetrack': MediaStreamTrackEvent;
}
interface VoidFunction {
    (): void;
}
type EventListenerOrEventListenerObject = EventListener | EventListenerObject;
interface EventListener {
    (evt: Event): void;
}
interface EventListenerObject {
    handleEvent(object: Event): void;
}
interface AddEventListenerOptions extends EventListenerOptions {
    once?: boolean;
    passive?: boolean;
    signal?: AbortSignal;
}
interface EventListenerOptions {
    capture?: boolean;
}
export type AlgorithmIdentifier = Algorithm | string;
interface Algorithm {
    name: string;
}
export interface RTCCertificate {
    readonly expires: EpochTimeStamp;
    getFingerprints(): RTCDtlsFingerprint[];
}
type EpochTimeStamp = number;
interface RTCDtlsFingerprint {
    algorithm?: string;
    value?: string;
}
interface RTCSctpTransportEventMap {
    'statechange': Event;
}
interface DOMException extends Error {
    /** @deprecated */
    readonly code: number;
    readonly message: string;
    readonly name: string;
    readonly ABORT_ERR: number;
    readonly DATA_CLONE_ERR: number;
    readonly DOMSTRING_SIZE_ERR: number;
    readonly HIERARCHY_REQUEST_ERR: number;
    readonly INDEX_SIZE_ERR: number;
    readonly INUSE_ATTRIBUTE_ERR: number;
    readonly INVALID_ACCESS_ERR: number;
    readonly INVALID_CHARACTER_ERR: number;
    readonly INVALID_MODIFICATION_ERR: number;
    readonly INVALID_NODE_TYPE_ERR: number;
    readonly INVALID_STATE_ERR: number;
    readonly NAMESPACE_ERR: number;
    readonly NETWORK_ERR: number;
    readonly NOT_FOUND_ERR: number;
    readonly NOT_SUPPORTED_ERR: number;
    readonly NO_DATA_ALLOWED_ERR: number;
    readonly NO_MODIFICATION_ALLOWED_ERR: number;
    readonly QUOTA_EXCEEDED_ERR: number;
    readonly SECURITY_ERR: number;
    readonly SYNTAX_ERR: number;
    readonly TIMEOUT_ERR: number;
    readonly TYPE_MISMATCH_ERR: number;
    readonly URL_MISMATCH_ERR: number;
    readonly VALIDATION_ERR: number;
    readonly WRONG_DOCUMENT_ERR: number;
}
interface RTCRtpCodingParameters {
    rid?: string;
}
type RTCPriorityType = 'high' | 'low' | 'medium' | 'very-low';
interface RTCRtpEncodingParameters extends RTCRtpCodingParameters {
    active?: boolean;
    maxBitrate?: number;
    maxFramerate?: number;
    networkPriority?: RTCPriorityType;
    priority?: RTCPriorityType;
    scaleResolutionDownBy?: number;
}
type BinaryType = 'arraybuffer' | 'blob';
interface MessageEvent<T = any> extends Event {
    /** Returns the data of the message. */
    readonly data: T;
    /** Returns the last event ID string, for server-sent events. */
    readonly lastEventId: string;
    /** Returns the origin of the message, for server-sent events and cross-document messaging. */
    readonly origin: string;
    /** Returns the MessagePort array sent with the message, for cross-document messaging and channel messaging. */
    readonly ports: ReadonlyArray<MessagePort>;
    /** Returns the WindowProxy of the source window, for cross-document messaging, and the MessagePort being attached, in the connect event fired at SharedWorkerGlobalScope objects. */
    readonly source: MessageEventSource | null;
    /** @deprecated */
    initMessageEvent(type: string, bubbles?: boolean, cancelable?: boolean, data?: any, origin?: string, lastEventId?: string, source?: MessageEventSource | null, ports?: MessagePort[]): void;
}
type MessageEventSource = any;
type MessagePort = any;
interface RTCDataChannelEventMap {
    'bufferedamountlow': Event;
    'close': Event;
    'closing': Event;
    'error': Event;
    'message': MessageEvent;
    'open': Event;
}
type DOMHighResTimeStamp = number;
interface RTCRtpContributingSource {
    audioLevel?: number;
    rtpTimestamp: number;
    source: number;
    timestamp: DOMHighResTimeStamp;
}
type RTCIceGathererState = 'complete' | 'gathering' | 'new';
type RTCIceTransportState = 'checking' | 'closed' | 'completed' | 'connected' | 'disconnected' | 'failed' | 'new';
interface RTCIceTransportEventMap {
    'gatheringstatechange': Event;
    'statechange': Event;
}
interface RTCIceTransport extends EventTarget {
    readonly gatheringState: RTCIceGathererState;
    ongatheringstatechange: ((this: RTCIceTransport, ev: Event) => any) | null;
    onstatechange: ((this: RTCIceTransport, ev: Event) => any) | null;
    readonly state: RTCIceTransportState;
    addEventListener<K extends keyof RTCIceTransportEventMap>(type: K, listener: (this: RTCIceTransport, ev: RTCIceTransportEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
    removeEventListener<K extends keyof RTCIceTransportEventMap>(type: K, listener: (this: RTCIceTransport, ev: RTCIceTransportEventMap[K]) => any, options?: boolean | EventListenerOptions): void;
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
}
interface RTCDtlsTransportEventMap {
    'error': Event;
    'statechange': Event;
}
export {};
