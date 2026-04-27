// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {DisconnectReason, RoomEvent} from 'livekit-client';
import RestClient from 'src/clients/rest';
import {RTC_EVENT} from 'src/constants';

import CallClient from './call_client';

jest.mock('src/clients/rest', () => ({
    __esModule: true,
    default: {
        fetch: jest.fn(),
    },
}));

jest.mock('livekit-client', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const {EventEmitter} = require('events');

    class MockRoom extends EventEmitter {}
    // eslint-disable-next-line no-undefined
    MockRoom.prototype.connect = jest.fn().mockResolvedValue(undefined);
    // eslint-disable-next-line no-undefined
    MockRoom.prototype.disconnect = jest.fn().mockResolvedValue(undefined);

    return {
        Room: MockRoom,
        RoomEvent: {
            Connected: 'connected',
            Disconnected: 'disconnected',
            ConnectionStateChanged: 'connectionStateChanged',
            Reconnecting: 'reconnecting',
            Reconnected: 'reconnected',
        },
        DisconnectReason: {
            UNKNOWN_REASON: 0,
            CLIENT_INITIATED: 1,
            DUPLICATE_IDENTITY: 2,
            SERVER_SHUTDOWN: 3,
            PARTICIPANT_REMOVED: 4,
            ROOM_DELETED: 5,
            STATE_MISMATCH: 6,
            JOIN_FAILURE: 7,
            MIGRATION: 8,
            SIGNAL_CLOSE: 9,
            ROOM_CLOSED: 10,
            USER_UNAVAILABLE: 11,
            USER_REJECTED: 12,
            SIP_TRUNK_FAILURE: 13,
            CONNECTION_TIMEOUT: 14,
        },
    };
});

const mockedFetch = RestClient.fetch as jest.Mock;

describe('CallClient', () => {
    let client: CallClient;

    beforeEach(() => {
        mockedFetch.mockResolvedValue({token: 'jwt', url: 'ws://localhost:7880'});
        client = new CallClient();
    });

    describe('connect', () => {
        it('fetches a token and calls room.connect with url and token', async () => {
            await client.connect('channel-1');

            expect(mockedFetch).toHaveBeenCalledTimes(1);
            expect(client.channelID).toBe('channel-1');
            expect(client.room).not.toBeNull();
            expect(client.room!.connect).toHaveBeenCalledWith('ws://localhost:7880', 'jwt');
        });

        it('throws if already connected', async () => {
            await client.connect('channel-1');
            await expect(client.connect('channel-2')).rejects.toThrow('call client: room already connected');
        });

        it('emits CONNECTED and stamps initTime on RoomEvent.Connected', async () => {
            const listener = jest.fn();
            client.on(RTC_EVENT.CONNECTED, listener);

            await client.connect('channel-1');
            const before = Date.now();
            client.room!.emit(RoomEvent.Connected);

            expect(listener).toHaveBeenCalledTimes(1);
            expect(client.initTime).toBeGreaterThanOrEqual(before);
        });

        it('emits DISCONNECTED with reason on RoomEvent.Disconnected', async () => {
            const listener = jest.fn();
            client.on(RTC_EVENT.DISCONNECTED, listener);

            await client.connect('channel-1');
            const reason = DisconnectReason.SERVER_SHUTDOWN;
            client.room!.emit(RoomEvent.Disconnected, reason);

            expect(listener).toHaveBeenCalledWith(reason);
        });

        it('emits RECONNECTING on RoomEvent.Reconnecting', async () => {
            const listener = jest.fn();
            client.on(RTC_EVENT.RECONNECTING, listener);

            await client.connect('channel-1');
            client.room!.emit(RoomEvent.Reconnecting);

            expect(listener).toHaveBeenCalledTimes(1);
        });

        it('emits RECONNECTED on RoomEvent.Reconnected', async () => {
            const listener = jest.fn();
            client.on(RTC_EVENT.RECONNECTED, listener);

            await client.connect('channel-1');
            client.room!.emit(RoomEvent.Reconnected);

            expect(listener).toHaveBeenCalledTimes(1);
        });

        it('emits ERROR and clears room when room.connect rejects', async () => {
            const listener = jest.fn();
            client.on(RTC_EVENT.ERROR, listener);

            const failure = new Error('connection refused');

            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const {Room} = require('livekit-client');
            (Room.prototype.connect as jest.Mock).mockRejectedValueOnce(failure);

            await expect(client.connect('channel-1')).rejects.toThrow('connection refused');
            expect(listener).toHaveBeenCalledWith(failure);
            expect(client.room).toBeNull();
        });
    });

    describe('disconnect', () => {
        it('calls room.disconnect and nulls out the room', async () => {
            await client.connect('channel-1');
            const roomRef = client.room!;

            await client.disconnect();

            expect(roomRef.disconnect).toHaveBeenCalledTimes(1);
            expect(client.room).toBeNull();
        });

        it('is idempotent across repeated calls', async () => {
            await client.connect('channel-1');
            const roomRef = client.room!;

            await client.disconnect();
            await client.disconnect();

            expect(roomRef.disconnect).toHaveBeenCalledTimes(1);
        });

        it('swallows errors from room.disconnect', async () => {
            await client.connect('channel-1');
            (client.room!.disconnect as jest.Mock).mockRejectedValueOnce(new Error('network'));

            await expect(client.disconnect()).resolves.toBeUndefined();
            expect(client.room).toBeNull();
        });

        it('emits ERROR when given an error before tearing down', async () => {
            const listener = jest.fn();
            client.on(RTC_EVENT.ERROR, listener);

            await client.connect('channel-1');
            const err = new Error('removed-by-host');

            await client.disconnect(err);

            expect(listener).toHaveBeenCalledWith(err);
        });

        it('is a no-op when never connected', async () => {
            await expect(client.disconnect()).resolves.toBeUndefined();
            expect(client.room).toBeNull();
        });
    });
});
