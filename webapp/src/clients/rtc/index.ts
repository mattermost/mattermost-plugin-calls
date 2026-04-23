// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {EventEmitter} from 'events';
import {ConnectionState, DisconnectReason, Room, RoomEvent} from 'livekit-client';
import RestClient from 'src/clients/rest';
import {RTC_EVENT, RTC_TOKEN_API_PATH} from 'src/constants';
import {logDebug, logErr, logInfo} from 'src/log';
import {getPluginPath} from 'src/utils';

export type RtcTokenResponse = {
    token: string;
    url: string;
};

export async function fetchRtcToken(channelID: string): Promise<RtcTokenResponse> {
    const url = `${getPluginPath()}/${RTC_TOKEN_API_PATH}?channel_id=${encodeURIComponent(channelID)}`;
    return RestClient.fetch<RtcTokenResponse>(url, {method: 'GET'});
}

export default class RtcClient extends EventEmitter {
    public channelID = '';
    public room: Room | null = null;
    private closed = false;

    private handleConnected() {
        logInfo('rtc client: connected to room');
        this.emit(RTC_EVENT.CONNECTED);
    }

    private handleConnectionStateChanged(state: ConnectionState) {
        logDebug('rtc client: connection state changed', state);
    }

    private handleReconnecting() {
        logInfo('rtc client: reconnecting to room');
        this.emit(RTC_EVENT.RECONNECTING);
    }

    private handleReconnected() {
        logInfo('rtc client: reconnected to room');
        this.emit(RTC_EVENT.RECONNECTED);
    }

    private handleDisconnected(reason?: DisconnectReason) {
        logInfo('rtc client: disconnected from room', reason);
        this.emit(RTC_EVENT.DISCONNECTED, reason);
    }

    public async connect(channelID: string): Promise<void> {
        if (this.room) {
            throw new Error('rtc client: room already connected');
        }

        this.channelID = channelID;

        const response = await fetchRtcToken(channelID);

        const token = response?.token ?? '';
        const url = response?.url ?? '';
        if (!token || !url) {
            throw new Error('rtc client: either token or url were not received from token API');
        }

        logInfo(`rtc client: trying to connect to ${url} for channel ${channelID} with valid token`);

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
            logErr(`rtc client: failed to connect to room ${url}`, err);
            this.room = null;
            this.emit(RTC_EVENT.ERROR, err);
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
                logErr('rtc client: error during disconnect', err);
            } finally {
                this.room = null;
            }
        }
    }
}
