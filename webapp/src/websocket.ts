// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {encode} from '@msgpack/msgpack/dist';
import {EventEmitter} from 'events';

import {logDebug, logErr, logInfo, logWarn} from './log';
import {pluginId} from './manifest';

const wsMinReconnectRetryTimeMs = 1000; // 1 second
const wsReconnectionTimeout = 30000; // 30 seconds
const wsReconnectTimeIncrement = 500; // 0.5 seconds
const wsPingIntervalMs = 5000; // 5 seconds

export enum WebSocketErrorType {
    Native,
    Join,
    ReconnectTimeout,
}

export class WebSocketError extends Error {
    public type: WebSocketErrorType;

    constructor(type: WebSocketErrorType, message: string) {
        super(message);

        this.type = type;

        // needed since we are extending a built-in class
        Object.setPrototypeOf(this, WebSocketError.prototype);
    }
}

export class WebSocketClient extends EventEmitter {
    private ws: WebSocket | null = null;
    private readonly wsURL: string;
    private readonly authToken: string;
    private seqNo = 1;
    private serverSeqNo = 0;
    private connID = '';
    private originalConnID = '';
    private eventPrefix: string = 'custom_' + pluginId;
    private lastDisconnect = 0;
    private reconnectRetryTime = wsMinReconnectRetryTimeMs;
    private closed = false;
    private pingInterval: ReturnType<typeof setInterval> | null = null;
    private waitingForPong = false;
    private pendingPingSeq = 0;

    constructor(wsURL: string, authToken?: string) {
        super();
        this.wsURL = wsURL;
        this.authToken = authToken || '';
        this.init(false);
    }

    private init(isReconnect: boolean) {
        if (this.closed) {
            logWarn('client is closed!');
            return;
        }

        this.ws = new WebSocket(`${this.wsURL}?connection_id=${this.connID}&sequence_number=${this.serverSeqNo}`);

        this.ws.onopen = () => {
            if (this.authToken) {
                this.ws?.send(JSON.stringify({
                    action: 'authentication_challenge',
                    seq: this.seqNo++,
                    data: {token: this.authToken},
                }));
            }
            if (isReconnect) {
                logDebug('ws: reconnected', this.originalConnID, this.connID);
                this.lastDisconnect = 0;
                this.reconnectRetryTime = wsMinReconnectRetryTimeMs;
                this.emit('open', this.originalConnID, this.connID, true);
            }

            // Start ping interval
            this.startPingInterval();

            // Send initial ping.
            this.ping();
        };

        this.ws.onerror = () => {
            this.emit('error', new WebSocketError(WebSocketErrorType.Native, 'websocket error'));
        };

        this.ws.onclose = this.closeHandler;

        this.ws.onmessage = ({data}) => {
            if (!data) {
                return;
            }
            let msg;
            try {
                msg = JSON.parse(data);
            } catch (err) {
                logErr('ws msg parse error', err);
                return;
            }

            // Handle pong response
            if (this.waitingForPong && msg?.seq_reply === this.pendingPingSeq) {
                this.waitingForPong = false;
                this.pendingPingSeq = 0;
                return;
            }

            if (msg) {
                this.serverSeqNo = msg.seq + 1;
            }

            if (!msg || !msg.event || !msg.data) {
                return;
            }

            if (msg.event === 'hello') {
                if (msg.data.connection_id !== this.connID) {
                    logDebug('ws: new conn id from server', msg.data.connection_id);
                    this.connID = msg.data.connection_id;
                    this.serverSeqNo = 0;
                    this.seqNo = 1;
                    if (this.originalConnID === '') {
                        logDebug('ws: setting original conn id', this.connID);
                        this.originalConnID = this.connID;
                    }

                    this.emit('event', msg);
                }
                if (!isReconnect) {
                    this.emit('open', this.originalConnID, this.connID, false);
                }
                return;
            } else if (!this.connID) {
                logWarn('ws message received while waiting for hello');
                return;
            }

            this.emit('event', msg);

            if (msg.data.connID !== this.connID && msg.data.connID !== this.originalConnID) {
                return;
            }

            if (msg.event === this.eventPrefix + '_join') {
                this.emit('join');
            }

            if (msg.event === this.eventPrefix + '_error') {
                this.emit('error', new WebSocketError(WebSocketErrorType.Join, msg.data.data));
            }

            if (msg.event === this.eventPrefix + '_signal') {
                this.emit('message', msg.data);
            }
        };
    }

    private closeHandler = (ev: CloseEvent) => {
        this.stopPingInterval();
        this.emit('close', ev.code);
        if (!this.closed) {
            this.reconnect();
        }
    };

    send(action: string, data?: Record<string, unknown>, binary?: boolean) {
        const msg = {
            action: `${this.eventPrefix}_${action}`,
            seq: this.seqNo++,
            data,
        };

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            if (binary) {
                this.ws.send(encode(msg));
            } else {
                this.ws.send(JSON.stringify(msg));
            }
        } else {
            logWarn('failed to send message, connection is not open', msg);
        }
    }

    close() {
        this.closed = true;
        this.stopPingInterval();
        this.ws?.close();
        this.ws = null;
        this.seqNo = 1;
        this.serverSeqNo = 0;
        this.pendingPingSeq = 0;
        this.connID = '';
        this.originalConnID = '';

        this.removeAllListeners('open');
        this.removeAllListeners('event');
        this.removeAllListeners('join');
        this.removeAllListeners('close');
        this.removeAllListeners('error');
        this.removeAllListeners('message');
    }

    reconnect() {
        const now = Date.now();
        if (this.lastDisconnect === 0) {
            this.lastDisconnect = now;
        }

        if ((now - this.lastDisconnect) >= wsReconnectionTimeout) {
            this.closed = true;
            this.emit('error', new WebSocketError(WebSocketErrorType.ReconnectTimeout, 'max disconnected time reached'));
            return;
        }

        setTimeout(() => {
            if (!this.closed) {
                logInfo('ws: reconnecting', this.originalConnID);
                this.init(true);
            }
        }, this.reconnectRetryTime);

        this.reconnectRetryTime += wsReconnectTimeIncrement;
    }

    getOriginalConnID() {
        return this.originalConnID;
    }

    private startPingInterval() {
        if (this.pingInterval) {
            this.stopPingInterval();
        }

        logDebug('ws: starting ping interval', this.originalConnID);

        this.pingInterval = setInterval(() => {
            if (this.waitingForPong && this.ws) {
                logWarn('ws: ping timeout, reconnecting', this.originalConnID);

                // We call the close handler directly since through ws.close() it could execute after a significant delay.
                this.ws.onclose = null;
                this.ws.close();
                this.closeHandler(new CloseEvent('close', {
                    code: 4000,
                }));

                return;
            }

            this.ping();
        }, wsPingIntervalMs);
    }

    private stopPingInterval() {
        if (this.pingInterval) {
            logDebug('ws: stopping ping interval', this.originalConnID);
            clearInterval(this.pingInterval);
            this.pingInterval = null;
            this.waitingForPong = false;
            this.pendingPingSeq = 0;
        }
    }

    private ping() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.waitingForPong = true;
            this.pendingPingSeq = this.seqNo;
            this.ws.send(JSON.stringify({
                action: 'ping',
                seq: this.seqNo++,
            }));
        }
    }
}
