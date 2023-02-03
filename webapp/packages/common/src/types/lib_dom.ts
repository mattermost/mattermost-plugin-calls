/* eslint-disable  @typescript-eslint/no-explicit-any */

//
// These are included because mobile doesn't have them build in.
// They are copied from lib.dom.d.ts
//

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

// eslint-disable-next-line no-var
export declare var RTCPeerConnection: {
    prototype: RTCPeerConnection;
    new(configuration?: RTCConfiguration): RTCPeerConnection;
    generateCertificate(keygenAlgorithm: AlgorithmIdentifier): Promise<RTCCertificate>;
};

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

type MediaStreamTrackState = 'ended' | 'live';

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

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface RTCOfferAnswerOptions {}

type RTCAnswerOptions = RTCOfferAnswerOptions

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

interface RTCConfiguration {
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

type RTCRtpReceiveParameters = RTCRtpParameters

type RTCRtpSynchronizationSource = RTCRtpContributingSource

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

type AlgorithmIdentifier = Algorithm | string;

interface Algorithm {
    name: string;
}

interface RTCCertificate {
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

type MessageEventSource = WindowProxy | MessagePort | ServiceWorker;

type WindowProxy = Window;

interface Window extends EventTarget, AnimationFrameProvider, GlobalEventHandlers, WindowEventHandlers, WindowLocalStorage, WindowOrWorkerGlobalScope, WindowSessionStorage {

    /** @deprecated This is a legacy alias of `navigator`. */
    readonly clientInformation: Navigator;

    /** Returns true if the window has been closed, false otherwise. */
    readonly closed: boolean;

    /** Defines a new custom element, mapping the given name to the given constructor as an autonomous custom element. */
    readonly customElements: CustomElementRegistry;
    readonly devicePixelRatio: number;
    readonly document: Document;

    /** @deprecated */
    readonly event: Event | undefined;

    /** @deprecated */
    readonly external: External;
    readonly frameElement: Element | null;
    readonly frames: WindowProxy;
    readonly history: History;
    readonly innerHeight: number;
    readonly innerWidth: number;
    readonly length: number;
    get location(): Location;
    set location(href: string | Location);

    /** Returns true if the location bar is visible; otherwise, returns false. */
    readonly locationbar: BarProp;

    /** Returns true if the menu bar is visible; otherwise, returns false. */
    readonly menubar: BarProp;
    name: string;
    readonly navigator: Navigator;

    /** Available only in secure contexts. */
    ondevicemotion: ((this: Window, ev: DeviceMotionEvent) => any) | null;

    /** Available only in secure contexts. */
    ondeviceorientation: ((this: Window, ev: DeviceOrientationEvent) => any) | null;

    /** @deprecated */
    onorientationchange: ((this: Window, ev: Event) => any) | null;
    opener: any;

    /** @deprecated */
    readonly orientation: number;
    readonly outerHeight: number;
    readonly outerWidth: number;

    /** @deprecated This is a legacy alias of `scrollX`. */
    readonly pageXOffset: number;

    /** @deprecated This is a legacy alias of `scrollY`. */
    readonly pageYOffset: number;

    /**
     * Refers to either the parent WindowProxy, or itself.
     *
     * It can rarely be null e.g. for contentWindow of an iframe that is already removed from the parent.
     */
    readonly parent: WindowProxy;

    /** Returns true if the personal bar is visible; otherwise, returns false. */
    readonly personalbar: BarProp;
    readonly screen: Screen;
    readonly screenLeft: number;
    readonly screenTop: number;
    readonly screenX: number;
    readonly screenY: number;
    readonly scrollX: number;
    readonly scrollY: number;

    /** Returns true if the scrollbars are visible; otherwise, returns false. */
    readonly scrollbars: BarProp;
    readonly self: Window & typeof globalThis;
    readonly speechSynthesis: SpeechSynthesis;

    /** @deprecated */
    status: string;

    /** Returns true if the status bar is visible; otherwise, returns false. */
    readonly statusbar: BarProp;

    /** Returns true if the toolbar is visible; otherwise, returns false. */
    readonly toolbar: BarProp;
    readonly top: WindowProxy | null;
    readonly visualViewport: VisualViewport | null;
    readonly window: Window & typeof globalThis;
    alert(message?: any): void;
    blur(): void;
    cancelIdleCallback(handle: number): void;

    /** @deprecated */
    captureEvents(): void;

    /** Closes the window. */
    close(): void;
    confirm(message?: string): boolean;

    /** Moves the focus to the window's browsing context, if any. */
    focus(): void;
    getComputedStyle(elt: Element, pseudoElt?: string | null): CSSStyleDeclaration;
    getSelection(): Selection | null;
    matchMedia(query: string): MediaQueryList;
    moveBy(x: number, y: number): void;
    moveTo(x: number, y: number): void;
    open(url?: string | URL, target?: string, features?: string): WindowProxy | null;

    /**
     * Posts a message to the given window. Messages can be structured objects, e.g. nested objects and arrays, can contain JavaScript values (strings, numbers, Date objects, etc), and can contain certain data objects such as File Blob, FileList, and ArrayBuffer objects.
     *
     * Objects listed in the transfer member of options are transferred, not just cloned, meaning that they are no longer usable on the sending side.
     *
     * A target origin can be specified using the targetOrigin member of options. If not provided, it defaults to "/". This default restricts the message to same-origin targets only.
     *
     * If the origin of the target window doesn't match the given target origin, the message is discarded, to avoid information leakage. To send the message to the target regardless of origin, set the target origin to "*".
     *
     * Throws a "DataCloneError" DOMException if transfer array contains duplicate objects or if message could not be cloned.
     */
    postMessage(message: any, targetOrigin: string, transfer?: Transferable[]): void;
    postMessage(message: any, options?: WindowPostMessageOptions): void;
    print(): void;
    prompt(message?: string, _default?: string): string | null;

    /** @deprecated */
    releaseEvents(): void;
    requestIdleCallback(callback: IdleRequestCallback, options?: IdleRequestOptions): number;
    resizeBy(x: number, y: number): void;
    resizeTo(width: number, height: number): void;
    scroll(options?: ScrollToOptions): void;
    scroll(x: number, y: number): void;
    scrollBy(options?: ScrollToOptions): void;
    scrollBy(x: number, y: number): void;
    scrollTo(options?: ScrollToOptions): void;
    scrollTo(x: number, y: number): void;

    /** Cancels the document load. */
    stop(): void;
    addEventListener<K extends keyof WindowEventMap>(type: K, listener: (this: Window, ev: WindowEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
    removeEventListener<K extends keyof WindowEventMap>(type: K, listener: (this: Window, ev: WindowEventMap[K]) => any, options?: boolean | EventListenerOptions): void;
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
    [index: number]: Window;
}

interface MessagePort extends EventTarget {
    onmessage: ((this: MessagePort, ev: MessageEvent) => any) | null;
    onmessageerror: ((this: MessagePort, ev: MessageEvent) => any) | null;

    /** Disconnects the port, so that it is no longer active. */
    close(): void;

    /**
     * Posts a message through the channel. Objects listed in transfer are transferred, not just cloned, meaning that they are no longer usable on the sending side.
     *
     * Throws a "DataCloneError" DOMException if transfer contains duplicate objects or port, or if message could not be cloned.
     */
    postMessage(message: any, transfer: Transferable[]): void;
    postMessage(message: any, options?: StructuredSerializeOptions): void;

    /** Begins dispatching messages received on the port. */
    start(): void;
    addEventListener<K extends keyof MessagePortEventMap>(type: K, listener: (this: MessagePort, ev: MessagePortEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
    removeEventListener<K extends keyof MessagePortEventMap>(type: K, listener: (this: MessagePort, ev: MessagePortEventMap[K]) => any, options?: boolean | EventListenerOptions): void;
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
}

type Transferable = OffscreenCanvas | ImageBitmap | MessagePort | ReadableStream | WritableStream | TransformStream | ArrayBuffer;

interface OffscreenCanvas extends EventTarget {

    /**
     * These attributes return the dimensions of the OffscreenCanvas object's bitmap.
     *
     * They can be set, to replace the bitmap with a new, transparent black bitmap of the specified dimensions (effectively resizing it).
     */
    height: number;
    oncontextlost: ((this: OffscreenCanvas, ev: Event) => any) | null;
    oncontextrestored: ((this: OffscreenCanvas, ev: Event) => any) | null;

    /**
     * These attributes return the dimensions of the OffscreenCanvas object's bitmap.
     *
     * They can be set, to replace the bitmap with a new, transparent black bitmap of the specified dimensions (effectively resizing it).
     */
    width: number;

    /**
     * Returns an object that exposes an API for drawing on the OffscreenCanvas object. contextId specifies the desired API: "2d", "bitmaprenderer", "webgl", or "webgl2". options is handled by that API.
     *
     * This specification defines the "2d" context below, which is similar but distinct from the "2d" context that is created from a canvas element. The WebGL specifications define the "webgl" and "webgl2" contexts. [WEBGL]
     *
     * Returns null if the canvas has already been initialized with another context type (e.g., trying to get a "2d" context after getting a "webgl" context).
     */
    getContext(contextId: OffscreenRenderingContextId, options?: any): OffscreenRenderingContext | null;

    /** Returns a newly created ImageBitmap object with the image in the OffscreenCanvas object. The image in the OffscreenCanvas object is replaced with a new blank image. */
    transferToImageBitmap(): ImageBitmap;
    addEventListener<K extends keyof OffscreenCanvasEventMap>(type: K, listener: (this: OffscreenCanvas, ev: OffscreenCanvasEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
    removeEventListener<K extends keyof OffscreenCanvasEventMap>(type: K, listener: (this: OffscreenCanvas, ev: OffscreenCanvasEventMap[K]) => any, options?: boolean | EventListenerOptions): void;
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
}

type OffscreenRenderingContextId = '2d' | 'bitmaprenderer' | 'webgl' | 'webgl2' | 'webgpu';

type OffscreenRenderingContext = OffscreenCanvasRenderingContext2D | ImageBitmapRenderingContext | WebGLRenderingContext | WebGL2RenderingContext;

interface OffscreenCanvasRenderingContext2D extends CanvasCompositing, CanvasDrawImage, CanvasDrawPath, CanvasFillStrokeStyles, CanvasFilters, CanvasImageData, CanvasImageSmoothing, CanvasPath, CanvasPathDrawingStyles, CanvasRect, CanvasShadowStyles, CanvasState, CanvasText, CanvasTextDrawingStyles, CanvasTransform {
    readonly canvas: OffscreenCanvas;
    commit(): void;
}

interface CanvasDrawImage {
    drawImage(image: CanvasImageSource, dx: number, dy: number): void;
    drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void;
    drawImage(image: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void;
}

type CanvasImageSource = HTMLOrSVGImageElement | HTMLVideoElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas;

type HTMLOrSVGImageElement = HTMLImageElement | SVGImageElement;

interface HTMLImageElement extends HTMLElement {

    /**
     * Sets or retrieves how the object is aligned with adjacent text.
     * @deprecated
     */
    align: string;

    /** Sets or retrieves a text alternative to the graphic. */
    alt: string;

    /**
     * Specifies the properties of a border drawn around an object.
     * @deprecated
     */
    border: string;

    /** Retrieves whether the object is fully loaded. */
    readonly complete: boolean;
    crossOrigin: string | null;
    readonly currentSrc: string;
    decoding: 'async' | 'sync' | 'auto';

    /** Sets or retrieves the height of the object. */
    height: number;

    /**
     * Sets or retrieves the width of the border to draw around the object.
     * @deprecated
     */
    hspace: number;

    /** Sets or retrieves whether the image is a server-side image map. */
    isMap: boolean;

    /** Sets or retrieves the policy for loading image elements that are outside the viewport. */
    loading: 'eager' | 'lazy';

    /**
     * Sets or retrieves a Uniform Resource Identifier (URI) to a long description of the object.
     * @deprecated
     */
    longDesc: string;

    /** @deprecated */
    lowsrc: string;

    /**
     * Sets or retrieves the name of the object.
     * @deprecated
     */
    name: string;

    /** The original height of the image resource before sizing. */
    readonly naturalHeight: number;

    /** The original width of the image resource before sizing. */
    readonly naturalWidth: number;
    referrerPolicy: string;
    sizes: string;

    /** The address or URL of the a media resource that is to be considered. */
    src: string;
    srcset: string;

    /** Sets or retrieves the URL, often with a bookmark extension (#name), to use as a client-side image map. */
    useMap: string;

    /**
     * Sets or retrieves the vertical margin for the object.
     * @deprecated
     */
    vspace: number;

    /** Sets or retrieves the width of the object. */
    width: number;
    readonly x: number;
    readonly y: number;
    decode(): Promise<void>;
    addEventListener<K extends keyof HTMLElementEventMap>(type: K, listener: (this: HTMLImageElement, ev: HTMLElementEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
    removeEventListener<K extends keyof HTMLElementEventMap>(type: K, listener: (this: HTMLImageElement, ev: HTMLElementEventMap[K]) => any, options?: boolean | EventListenerOptions): void;
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
}

interface SVGImageElement extends SVGGraphicsElement, SVGURIReference {
    readonly height: SVGAnimatedLength;
    readonly preserveAspectRatio: SVGAnimatedPreserveAspectRatio;
    readonly width: SVGAnimatedLength;
    readonly x: SVGAnimatedLength;
    readonly y: SVGAnimatedLength;
    addEventListener<K extends keyof SVGElementEventMap>(type: K, listener: (this: SVGImageElement, ev: SVGElementEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
    removeEventListener<K extends keyof SVGElementEventMap>(type: K, listener: (this: SVGImageElement, ev: SVGElementEventMap[K]) => any, options?: boolean | EventListenerOptions): void;
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
}

interface SVGGraphicsElement extends SVGElement, SVGTests {
    readonly transform: SVGAnimatedTransformList;
    getBBox(options?: SVGBoundingBoxOptions): DOMRect;
    getCTM(): DOMMatrix | null;
    getScreenCTM(): DOMMatrix | null;
    addEventListener<K extends keyof SVGElementEventMap>(type: K, listener: (this: SVGGraphicsElement, ev: SVGElementEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
    removeEventListener<K extends keyof SVGElementEventMap>(type: K, listener: (this: SVGGraphicsElement, ev: SVGElementEventMap[K]) => any, options?: boolean | EventListenerOptions): void;
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
}

interface SVGElement extends Element, DocumentAndElementEventHandlers, ElementCSSInlineStyle, GlobalEventHandlers, HTMLOrSVGElement {

    /** @deprecated */
    readonly className: any;
    readonly ownerSVGElement: SVGSVGElement | null;
    readonly viewportElement: SVGElement | null;
    addEventListener<K extends keyof SVGElementEventMap>(type: K, listener: (this: SVGElement, ev: SVGElementEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
    removeEventListener<K extends keyof SVGElementEventMap>(type: K, listener: (this: SVGElement, ev: SVGElementEventMap[K]) => any, options?: boolean | EventListenerOptions): void;
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
}

interface SVGTests {
    readonly requiredExtensions: SVGStringList;
    readonly systemLanguage: SVGStringList;
}

interface SVGStringList {
    readonly length: number;
    readonly numberOfItems: number;
    appendItem(newItem: string): string;
    clear(): void;
    getItem(index: number): string;
    initialize(newItem: string): string;
    insertItemBefore(newItem: string, index: number): string;
    removeItem(index: number): string;
    replaceItem(newItem: string, index: number): string;
    [index: number]: string;
}

interface CanvasCompositing {
    globalAlpha: number;
    globalCompositeOperation: GlobalCompositeOperation;
}

type GlobalCompositeOperation = 'color' | 'color-burn' | 'color-dodge' | 'copy' | 'darken' | 'destination-atop' | 'destination-in' | 'destination-out' | 'destination-over' | 'difference' | 'exclusion' | 'hard-light' | 'hue' | 'lighten' | 'lighter' | 'luminosity' | 'multiply' | 'overlay' | 'saturation' | 'screen' | 'soft-light' | 'source-atop' | 'source-in' | 'source-out' | 'source-over' | 'xor';

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
