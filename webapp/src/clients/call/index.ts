// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {EventEmitter} from 'events';
import {ConnectionState, DisconnectReason, Room, RoomEvent} from 'livekit-client';
import RestClient from 'src/clients/rest';
import {CALL_EVENT, CALL_TOKEN_API_PATH} from 'src/constants';
import {logDebug, logErr, logInfo} from 'src/log';
import {getPluginPath} from 'src/utils';

export type CallTokenResponse = {
    token: string;
    url: string;
};

export async function fetchCallToken(channelID: string): Promise<CallTokenResponse> {
    const url = `${getPluginPath()}/${CALL_TOKEN_API_PATH}?channel_id=${encodeURIComponent(channelID)}`;
    return RestClient.fetch<CallTokenResponse>(url, {method: 'GET'});
}

export default class CallClient extends EventEmitter {
    public channelID = '';
    public room: Room | null = null;
    private closed = false;

    private handleConnected() {
        logInfo('call client: connected to room');
        this.emit(CALL_EVENT.CONNECTED);
    }

    private handleConnectionStateChanged(state: ConnectionState) {
        logDebug('call client: connection state changed', state);
    }

    private handleReconnecting() {
        logInfo('call client: reconnecting to room');
        this.emit(CALL_EVENT.RECONNECTING);
    }

    private handleReconnected() {
        logInfo('call client: reconnected to room');
        this.emit(CALL_EVENT.RECONNECTED);
    }

    private handleDisconnected(reason?: DisconnectReason) {
        logInfo('call client: disconnected from room', reason);
        this.emit(CALL_EVENT.DISCONNECTED, reason);
    }

    public async connect(channelID: string): Promise<void> {
        if (this.room) {
            throw new Error('call client: room already connected');
        }

        this.channelID = channelID;

        const response = await fetchCallToken(channelID);

        const token = response?.token ?? '';
        const url = response?.url ?? '';
        if (!token || !url) {
            throw new Error('call client: either token or url were not received from token API');
        }

        logInfo(`call client: trying to connect to ${url} for channel ${channelID} with valid token`);

        const room = new Room();
        this.room = room;

        room.on(RoomEvent.Connected, this.handleConnected.bind(this));
        room.on(RoomEvent.ConnectionStateChanged, this.handleConnectionStateChanged.bind(this));
        room.on(RoomEvent.Reconnecting, this.handleReconnecting.bind(this));
        room.on(RoomEvent.Reconnected, this.handleReconnected.bind(this));
        room.on(RoomEvent.Disconnected, this.handleDisconnected.bind(this));

        try {
            await room.connect(url, token);
        } catch (err) {
            logErr(`call client: failed to connect to room ${url}`, err);
            this.room = null;
            this.emit(CALL_EVENT.ERROR, err);
            throw err;
        }
    }

    public async disconnect(): Promise<void> {
        if (this.closed) {
            return;
        }
        this.closed = true;

        if (this.room) {
            try {
                await this.room.disconnect();
            } catch (err) {
                logErr('call client: error during disconnect', err);
            } finally {
                this.room = null;
            }
        }
    }
}
