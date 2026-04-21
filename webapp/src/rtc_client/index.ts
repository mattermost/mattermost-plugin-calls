// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {EventEmitter} from 'events';
import {ConnectionState, DisconnectReason, Room, RoomEvent} from 'livekit-client';
import {RTC_TOKEN_API_PATH} from 'src/constants';
import {logDebug, logErr, logInfo} from 'src/log';
import RestClient from 'src/rest_client';
import {getPluginPath} from 'src/utils';

export type RTCTokenResponse = {
    token: string;
    url: string;
};

export async function fetchRTCToken(channelID: string): Promise<RTCTokenResponse> {
    const url = `${getPluginPath()}/${RTC_TOKEN_API_PATH}?channel_id=${encodeURIComponent(channelID)}`;
    return RestClient.fetch<RTCTokenResponse>(url, {method: 'GET'});
}

export default class RTCClient extends EventEmitter {
    public channelID = '';
    public room: Room | null = null;
    private closed = false;

    public async connect(channelID: string): Promise<void> {
        if (this.room) {
            throw new Error('rtc client already connected');
        }

        this.channelID = channelID;

        const {token, url} = await fetchRTCToken(channelID);
        logInfo(`rtc: connecting to ${url} for channel ${channelID}`);

        const room = new Room();
        this.room = room;

        room.on(RoomEvent.Connected, () => {
            logInfo('rtc: connected');
            this.emit('connect');
        });

        room.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
            logInfo('rtc: disconnected', reason);
            this.emit('close', reason);
        });

        room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
            logDebug('rtc: connection state', state);
        });

        try {
            await room.connect(url, token);
        } catch (err) {
            logErr('rtc: failed to connect', err);
            this.room = null;
            this.emit('error', err);
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
                logErr('rtc: error during disconnect', err);
            }
            this.room = null;
        }
    }
}
