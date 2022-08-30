import {EventEmitter} from 'events';

import {
    RTCPeerConfig,
} from './types';

export default class RTCPeer extends EventEmitter {
    private pc: RTCPeerConnection | null;
    private senders: {[key: string]: RTCRtpSender};

    constructor(config: RTCPeerConfig) {
        super();

        // We keep a map of track IDs -> RTP sender so that we can easily
        // replace tracks when muting/unmuting.
        this.senders = {};

        this.pc = new RTCPeerConnection(config);
        this.pc.onnegotiationneeded = () => this.onNegotiationNeeded();
        this.pc.onicecandidate = (ev) => this.onICECandidate(ev);
        this.pc.oniceconnectionstatechange = () => this.onICEConnectionStateChange();
        this.pc.ontrack = (ev) => this.onTrack(ev);

        // We create a data channel for two reasons:
        // - Initiate a connection without preemptively add audio/video tracks.
        // - Use this communication channel for further negotiation (to be implemented).
        this.pc.createDataChannel('calls-dc');
    }

    private onICECandidate(ev: RTCPeerConnectionIceEvent) {
        if (ev.candidate) {
            this.emit('candidate', ev.candidate);
        }
    }

    private onICEConnectionStateChange() {
        switch (this.pc?.iceConnectionState) {
        case 'connected':
            this.emit('connect');
            break;
        case 'failed':
            this.emit('error', new Error('rtc connection failed'));
            break;
        case 'closed':
            this.emit('close');
            break;
        default:
        }
    }

    private async onNegotiationNeeded() {
        try {
            await this.pc?.setLocalDescription(await this.pc?.createOffer());
            this.emit('offer', this.pc?.localDescription);
        } catch (err) {
            this.emit('error', err);
        }
    }

    private onTrack(ev: RTCTrackEvent) {
        if (ev.streams.length === 0) {
            this.emit('stream', new MediaStream([ev.track]));
            return;
        }
        this.emit('stream', ev.streams[0]);
    }

    public async signal(data: string) {
        if (!this.pc) {
            throw new Error('peer has been destroyed');
        }

        const msg = JSON.parse(data);

        switch (msg.type) {
        case 'candidate':
            await this.pc.addIceCandidate(msg.candidate);
            break;
        case 'offer':
            await this.pc.setRemoteDescription(msg);
            await this.pc.setLocalDescription(await this.pc.createAnswer());
            this.emit('answer', this.pc.localDescription);
            break;
        case 'answer':
            await this.pc.setRemoteDescription(msg);
            break;
        default:
            throw new Error('invalid signaling data received');
        }
    }

    public async addTrack(track: MediaStreamTrack, stream?: MediaStream) {
        if (!this.pc) {
            throw new Error('peer has been destroyed');
        }
        const sender = await this.pc.addTrack(track, stream!);
        if (sender) {
            this.senders[track.id] = sender;
        }
    }

    public addStream(stream: MediaStream) {
        stream.getTracks().forEach(track => {
            this.addTrack(track, stream);
        });
    }

    public replaceTrack(oldTrackID: string, newTrack: MediaStreamTrack) {
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
        this.pc.ontrack = null;
        this.pc.close();
        this.pc = null;
    }
}
