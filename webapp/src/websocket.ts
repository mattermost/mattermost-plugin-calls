import {EventEmitter} from 'events';

import {encode} from '@msgpack/msgpack/dist';

import {id as pluginID} from './manifest';
import {getWSConnectionURL} from './utils';

export default class WebSocketClient extends EventEmitter {
    private ws: WebSocket | null;
    private seqNo = 0;
    private eventPrefix: string = 'custom_' + pluginID;

    constructor() {
        super();
        this.ws = new WebSocket(getWSConnectionURL());

        this.ws.onopen = () => {
            this.emit('open');
        };

        this.ws.onerror = (err) => {
            this.emit('error', err);
            this.ws = null;
            this.close();
        };

        this.ws.onclose = () => {
            this.ws = null;
            this.close();
        };

        this.ws.onmessage = ({data}) => {
            if (!data) {
                return;
            }
            let msg;
            try {
                msg = JSON.parse(data);
            } catch (err) {
                console.log(err);
            }

            if (!msg || !msg.event || !msg.data) {
                return;
            }

            if (msg.event !== this.eventPrefix + '_signal') {
                return;
            }

            this.emit('message', msg.data);
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

    close() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.seqNo = 0;
        this.emit('close');
    }
}
