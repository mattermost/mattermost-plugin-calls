import {EventEmitter} from 'events';

import {encode} from '@msgpack/msgpack/dist';

import {pluginId} from './manifest';
import {logDebug, logInfo, logWarn, logErr} from './log';

const wsMinReconnectRetryTimeMs = 1000; // 1 second
const wsReconnectionTimeout = 30000; // 30 seconds
const wsReconnectTimeIncrement = 500; // 0.5 seconds

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
    private wsURL: string;
    private seqNo = 1;
    private serverSeqNo = 0;
    private connID = '';
    private originalConnID = '';
    private eventPrefix: string = 'custom_' + pluginId;
    private lastDisconnect = 0;
    private reconnectRetryTime = wsMinReconnectRetryTimeMs;
    private closed = false;

    constructor(wsURL: string) {
        super();
        this.wsURL = wsURL;
        this.init(false);
    }

    private init(isReconnect: boolean) {
        if (this.closed) {
            logWarn('client is closed!');
            return;
        }

        this.ws = new WebSocket(`${this.wsURL}?connection_id=${this.connID}&sequence_number=${this.serverSeqNo}`);

        if (isReconnect) {
            this.ws.onopen = () => {
                logDebug('ws: reconnected');
                this.lastDisconnect = 0;
                this.reconnectRetryTime = wsMinReconnectRetryTimeMs;
                this.emit('open', this.originalConnID, this.connID, true);
            };
        }

        this.ws.onerror = () => {
            this.emit('error', new WebSocketError(WebSocketErrorType.Native, 'websocket error'));
        };

        this.ws.onclose = ({code}) => {
            this.ws = null;
            if (!this.closed) {
                this.close(code);
            }
        };

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

            if (msg) {
                this.serverSeqNo = msg.seq + 1;
            }

            if (!msg || !msg.event || !msg.data) {
                return;
            }

            if (msg.event === 'hello') {
                if (msg.data.connection_id !== this.connID) {
                    logDebug('ws: new conn id from server');
                    this.connID = msg.data.connection_id;
                    this.serverSeqNo = 0;
                    if (this.originalConnID === '') {
                        logDebug('ws: setting original conn id');
                        this.originalConnID = this.connID;
                    }
                }
                if (!isReconnect) {
                    this.emit('open', this.originalConnID, this.connID, false);
                }
                return;
            } else if (!this.connID) {
                logWarn('ws message received while waiting for hello');
                return;
            }

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

    send(action: string, data?: Object, binary?: boolean) {
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
        }
    }

    close(code?: number) {
        if (this.ws) {
            this.closed = true;
            this.ws.close();
            this.ws = null;
            this.seqNo = 1;
            this.serverSeqNo = 0;
            this.connID = '';
            this.originalConnID = '';
        } else {
            this.emit('close', code);

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
                if (!this.ws && !this.closed) {
                    logInfo('ws: reconnecting');
                    this.init(true);
                }
            }, this.reconnectRetryTime);

            this.reconnectRetryTime += wsReconnectTimeIncrement;
        }
    }
}
