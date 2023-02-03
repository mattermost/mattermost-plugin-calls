"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RTCPeer = void 0;
const events_1 = require("events");
// eslint-disable-next-line no-duplicate-imports
const types_1 = require("./types");
const rtcConnFailedErr = new Error('rtc connection failed');
class RTCPeer extends events_1.EventEmitter {
    constructor(config, logDebug) {
        super();
        this.makingOffer = false;
        this.logDebug = logDebug;
        // We keep a map of track IDs -> RTP sender so that we can easily
        // replace tracks when muting/unmuting.
        this.senders = {};
        this.pc = new types_1.RTCPeerConnection(config);
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
    onICECandidate(ev) {
        if (ev.candidate) {
            this.emit('candidate', ev.candidate);
        }
    }
    onConnectionStateChange() {
        var _a;
        switch ((_a = this.pc) === null || _a === void 0 ? void 0 : _a.connectionState) {
            case 'connected':
                this.connected = true;
                break;
            case 'failed':
                this.emit('close', rtcConnFailedErr);
                break;
        }
    }
    onICEConnectionStateChange() {
        var _a;
        switch ((_a = this.pc) === null || _a === void 0 ? void 0 : _a.iceConnectionState) {
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
    onNegotiationNeeded() {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            try {
                this.makingOffer = true;
                yield ((_a = this.pc) === null || _a === void 0 ? void 0 : _a.setLocalDescription());
                this.emit('offer', (_b = this.pc) === null || _b === void 0 ? void 0 : _b.localDescription);
            }
            catch (err) {
                this.emit('error', err);
            }
            finally {
                this.makingOffer = false;
            }
        });
    }
    onTrack(ev) {
        if (ev.streams.length === 0) {
            this.emit('stream', new MediaStream([ev.track]));
            return;
        }
        this.emit('stream', ev.streams[0]);
    }
    signal(data) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.pc) {
                throw new Error('peer has been destroyed');
            }
            const msg = JSON.parse(data);
            if (msg.type === 'offer' && (this.makingOffer || ((_a = this.pc) === null || _a === void 0 ? void 0 : _a.signalingState) !== 'stable')) {
                this.logDebug('signaling conflict, we are polite, proceeding...');
            }
            switch (msg.type) {
                case 'candidate':
                    yield this.pc.addIceCandidate(msg.candidate);
                    break;
                case 'offer':
                    yield this.pc.setRemoteDescription(msg);
                    yield this.pc.setLocalDescription();
                    this.emit('answer', this.pc.localDescription);
                    break;
                case 'answer':
                    yield this.pc.setRemoteDescription(msg);
                    break;
                default:
                    throw new Error('invalid signaling data received');
            }
        });
    }
    addTrack(track, stream) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.pc) {
                throw new Error('peer has been destroyed');
            }
            const sender = yield this.pc.addTrack(track, stream);
            if (sender) {
                this.senders[track.id] = sender;
            }
        });
    }
    addStream(stream) {
        stream.getTracks().forEach((track) => {
            this.addTrack(track, stream);
        });
    }
    replaceTrack(oldTrackID, newTrack) {
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
    getStats() {
        if (!this.pc) {
            throw new Error('peer has been destroyed');
        }
        return this.pc.getStats(null);
    }
    destroy() {
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
exports.RTCPeer = RTCPeer;
