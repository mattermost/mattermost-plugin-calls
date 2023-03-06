import {EventEmitter} from 'events';

import {RTCPeerConfig, Webrtc} from './types';

const rtcConnFailedErr = new Error('rtc connection failed');

export class RTCPeer extends EventEmitter {
    private pc: RTCPeerConnection | null;
    private readonly senders: { [key: string]: RTCRtpSender };
    private readonly logDebug: (...args: unknown[]) => void;
    private readonly logErr: (...args: unknown[]) => void;
    private readonly webrtc: Webrtc;

    private makingOffer = false;
    private candidates: RTCIceCandidate[] = [];

    public connected: boolean;

    constructor(config: RTCPeerConfig) {
        super();
        this.logDebug = config.logDebug;
        this.logErr = config.logErr;

        // use the provided webrtc methods (for mobile), or the build in lib.dom methods (for webapp)
        if (config.webrtc) {
            this.webrtc = config.webrtc;
        } else {
            this.webrtc = {
                MediaStream,
                RTCPeerConnection,
            };
        }

        // We keep a map of track IDs -> RTP sender so that we can easily
        // replace tracks when muting/unmuting.
        this.senders = {};

        this.pc = new this.webrtc.RTCPeerConnection(config);
        this.pc.onnegotiationneeded = () => this.onNegotiationNeeded();
        this.pc.onicecandidate = (ev) => this.onICECandidate(ev);
        this.pc.oniceconnectionstatechange = () => this.onICEConnectionStateChange();
        this.pc.onconnectionstatechange = () => this.onConnectionStateChange();
        this.pc.ontrack = (ev) => this.onTrack(ev);

        this.connected = false;

        // We create a data channel for two reasons:
        // - Initiate a connection without preemptively adding audio/video tracks.
        // - Use this communication channel for further negotiation (to be implemented).
        this.pc.createDataChannel('calls-dc');
    }

    private onICECandidate(ev: RTCPeerConnectionIceEvent) {
        if (ev.candidate) {
            this.emit('candidate', ev.candidate);
        }
    }

    private onConnectionStateChange() {
        switch (this.pc?.connectionState) {
        case 'connected':
            this.connected = true;
            break;
        case 'failed':
            this.emit('close', rtcConnFailedErr);
            break;
        }
    }

    private onICEConnectionStateChange() {
        switch (this.pc?.iceConnectionState) {
        case 'connected':
            this.emit('connect');
            break;
        case 'failed':
            this.emit('close', rtcConnFailedErr);
            break;
        case 'closed':
            this.emit('close');
            break;
        default:
        }
    }

    private async onNegotiationNeeded() {
        try {
            this.makingOffer = true;
            await this.pc?.setLocalDescription();
            this.emit('offer', this.pc?.localDescription);
        } catch (err) {
            this.emit('error', err);
        } finally {
            this.makingOffer = false;
        }
    }

    private onTrack(ev: RTCTrackEvent) {
        if (ev.streams.length === 0) {
            this.emit('stream', new this.webrtc.MediaStream([ev.track]));
            return;
        }
        this.emit('stream', ev.streams[0]);
    }

    public async signal(data: string) {
        if (!this.pc) {
            throw new Error('peer has been destroyed');
        }

        const msg = JSON.parse(data);

        if (msg.type === 'offer' && (this.makingOffer || this.pc?.signalingState !== 'stable')) {
            this.logDebug('signaling conflict, we are polite, proceeding...');
        }

        switch (msg.type) {
        case 'candidate':
            // It's possible that ICE candidates are received moments before
            // we set the initial remote description which would cause an
            // error. In such case we queue them up to be added later.
            if (this.pc.remoteDescription && this.pc.remoteDescription.type) {
                this.pc.addIceCandidate(msg.candidate).catch((err) => {
                    this.logErr('failed to add candidate', err);
                });
            } else {
                this.logDebug('received ice candidate before remote description, queuing...');
                this.candidates.push(msg.candidate);
            }
            break;
        case 'offer':
            await this.pc.setRemoteDescription(msg);
            await this.pc.setLocalDescription();
            this.emit('answer', this.pc.localDescription);
            break;
        case 'answer':
            await this.pc.setRemoteDescription(msg);
            for (const candidate of this.candidates) {
                this.logDebug('adding queued ice candidate');
                this.pc.addIceCandidate(candidate).catch((err) => {
                    this.logErr('failed to add candidate', err);
                });
            }
            break;
        default:
            throw new Error('invalid signaling data received');
        }
    }

    public async addTrack(track: MediaStreamTrack, stream: MediaStream) {
        if (!this.pc) {
            throw new Error('peer has been destroyed');
        }
        const sender = await this.pc.addTrack(track, stream);
        if (sender) {
            this.senders[track.id] = sender;
        }
    }

    public addStream(stream: MediaStream) {
        stream.getTracks().forEach((track) => {
            this.addTrack(track, stream);
        });
    }

    public replaceTrack(oldTrackID: string, newTrack: MediaStreamTrack | null) {
        const sender = this.senders[oldTrackID];
        if (!sender) {
            throw new Error('sender for track not found');
        }
        if (newTrack && newTrack.id !== oldTrackID) {
            delete this.senders[oldTrackID];
            this.senders[newTrack.id] = sender;
        }
        sender.replaceTrack(newTrack);
    }

    public getStats() {
        if (!this.pc) {
            throw new Error('peer has been destroyed');
        }
        return this.pc.getStats(null);
    }

    public destroy() {
        if (!this.pc) {
            throw new Error('peer has been destroyed already');
        }

        this.removeAllListeners('candidate');
        this.removeAllListeners('connect');
        this.removeAllListeners('error');
        this.removeAllListeners('close');
        this.removeAllListeners('offer');
        this.removeAllListeners('answer');
        this.removeAllListeners('stream');
        this.pc.onnegotiationneeded = null;
        this.pc.onicecandidate = null;
        this.pc.oniceconnectionstatechange = null;
        this.pc.onconnectionstatechange = null;
        this.pc.ontrack = null;
        this.pc.close();
        this.pc = null;
        this.connected = false;
    }
}
