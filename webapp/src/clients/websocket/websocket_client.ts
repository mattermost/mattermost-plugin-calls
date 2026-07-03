// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {encode} from '@msgpack/msgpack/dist';
import {EventEmitter} from 'events';
import {logDebug, logErr, logInfo, logWarn} from 'src/log';
import {pluginId} from 'src/manifest';

import {
    wsMinReconnectRetryTimeMs,
    wsPingIntervalMs,
    wsReconnectionTimeout,
    wsReconnectTimeIncrement,
} from './constants';
import {WebSocketErrorType} from './types';
import {WebSocketError} from './websocket_error';

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
    private expectedPongSeqNo = 0;

    constructor(wsURL: string, authToken?: string) {
        super();

        this.wsURL = wsURL;
        this.authToken = authToken || '';
    }

    /**
     * Create a new WebSocket connection and handle the connection lifecycle.
     */
    public connect(isReconnect = false) {
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
            if (this.waitingForPong && msg?.seq_reply === this.expectedPongSeqNo) {
                this.waitingForPong = false;
                this.expectedPongSeqNo = 0;
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

    /**
     * Resolves with the originalConnID once the server's plugin-WS join ack
     * has arrived. The server registers the session (p.sessions[connID])
     * inside its join handler so futher HTTP endpoints that validate against p.sessions
     */
    public async ready(): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            this.once('join', () => resolve(this.originalConnID));
            this.once('error', reject);
        });
    }

    private closeHandler = (ev: CloseEvent) => {
        this.stopPingInterval();
        this.emit('close', ev.code);
        if (!this.closed) {
            this.reconnect();
        }
    };

    public send(action: string, data?: Record<string, unknown>, binary?: boolean) {
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

    public sendJoin(payload: {channelID: string; title?: string; threadID?: string; jobID?: string}) {
        this.send('join', payload);
    }

    public sendReconnect(payload: {channelID: string; originalConnID: string; prevConnID: string}) {
        this.send('reconnect', payload);
    }

    public sendLeave() {
        this.send('leave');
    }

    /**
     * Sends a leave message and closes the connection. When the WS is
     * reconnecting (CONNECTING state), queues the leave to fire as soon as
     * the pending connection opens before closing. This prevents a ~100s
     * server-side session orphan when LiveKit fails while the plugin WS is
     * mid-reconnect and sendLeave() would otherwise be silently dropped.
     */
    public sendLeaveAndClose() {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.send('leave');
            this.close();
            return;
        }
        if (this.closed) {
            this.close();
            return;
        }

        // WS is reconnecting. Stop further reconnect attempts, then queue
        // leave+cleanup for when the current connection attempt opens.
        this.closed = true;
        this.once('open', () => {
            this.send('leave');
            this.ws?.close();
            this.ws = null;
        });
    }

    public sendScreenOn(payload: {screenStreamID: string}) {
        this.send('screen_on', {data: JSON.stringify(payload)});
    }

    public sendScreenOff() {
        this.send('screen_off');
    }

    // e2eForceClose closes the underlying WebSocket without flipping
    // `this.closed`, so closeHandler still triggers reconnect — used by E2E
    // tests to simulate a transport-level network drop.
    public e2eForceClose() {
        this.ws?.close();
    }

    public close() {
        this.closed = true;
        this.stopPingInterval();
        this.ws?.close();
        this.ws = null;
        this.seqNo = 1;
        this.serverSeqNo = 0;
        this.expectedPongSeqNo = 0;
        this.connID = '';
        this.originalConnID = '';

        this.removeAllListeners('open');
        this.removeAllListeners('event');
        this.removeAllListeners('join');
        this.removeAllListeners('close');
        this.removeAllListeners('error');
        this.removeAllListeners('message');
    }

    public reconnect() {
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
                this.connect(true);
            }
        }, this.reconnectRetryTime);

        this.reconnectRetryTime += wsReconnectTimeIncrement;
    }

    public getOriginalConnID() {
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
            this.expectedPongSeqNo = 0;
        }
    }

    private ping() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.waitingForPong = true;

            // This is used to track the expected pong response which should match the request's sequence number.
            this.expectedPongSeqNo = this.seqNo;

            this.ws.send(JSON.stringify({
                action: 'ping',
                seq: this.seqNo++,
            }));
        }
    }
}
