// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import RestClient from 'src/clients/rest';
import {logErr} from 'src/log';
import {getPluginPath} from 'src/utils';

import {HOST_CHANGED} from './action_types';
import {
    hostChanged,
    hostLowerParticipantHand,
    hostMakeParticipantHost,
    hostMuteAllParticipants,
    hostMuteParticipant,
    hostRemoveParticipant,
    hostSwitchParticipantScreenOff,
} from './actions';

jest.mock('src/clients/rest', () => ({
    __esModule: true,
    default: {
        fetch: jest.fn(),
    },
}));

jest.mock('src/log', () => ({
    logErr: jest.fn(),
}));

const mockedFetch = RestClient.fetch as jest.Mock;
const mockedLogErr = logErr as jest.Mock;

const callBase = `${getPluginPath()}/calls/call1`;

beforeEach(() => {
    mockedFetch.mockResolvedValue({});
});

describe('hostChanged', () => {
    test('builds the HOST_CHANGED action', () => {
        expect(hostChanged('channel1', 'host1', 1000)).toEqual({
            type: HOST_CHANGED,
            data: {
                channelID: 'channel1',
                hostID: 'host1',
                hostChangeAt: 1000,
            },
        });
    });
});

describe('hostMakeParticipantHost', () => {
    test('posts the new host id to /host/make', async () => {
        await hostMakeParticipantHost('call1', 'host2');
        expect(mockedFetch).toHaveBeenCalledWith(`${callBase}/host/make`, {
            method: 'post',
            body: JSON.stringify({new_host_id: 'host2'}),
        });
    });
});

describe('hostMuteParticipant', () => {
    test('posts the session id to /host/mute', async () => {
        await hostMuteParticipant('call1', 'session1');
        expect(mockedFetch).toHaveBeenCalledWith(`${callBase}/host/mute`, {
            method: 'post',
            body: JSON.stringify({session_id: 'session1'}),
        });
    });

    test('swallows request errors and logs them', async () => {
        const err = new Error('boom');
        mockedFetch.mockRejectedValue(err);

        await expect(hostMuteParticipant('call1', 'session1')).resolves.toBeUndefined();
        expect(mockedLogErr).toHaveBeenCalledWith(err);
    });
});

describe('hostSwitchParticipantScreenOff', () => {
    test('posts the session id to /host/screen-off', async () => {
        await hostSwitchParticipantScreenOff('call1', 'session1');
        expect(mockedFetch).toHaveBeenCalledWith(`${callBase}/host/screen-off`, {
            method: 'post',
            body: JSON.stringify({session_id: 'session1'}),
        });
    });
});

describe('hostLowerParticipantHand', () => {
    test('posts the session id to /host/lower-hand', async () => {
        await hostLowerParticipantHand('call1', 'session1');
        expect(mockedFetch).toHaveBeenCalledWith(`${callBase}/host/lower-hand`, {
            method: 'post',
            body: JSON.stringify({session_id: 'session1'}),
        });
    });
});

describe('hostRemoveParticipant', () => {
    test('posts the session id to /host/remove', async () => {
        await hostRemoveParticipant('call1', 'session1');
        expect(mockedFetch).toHaveBeenCalledWith(`${callBase}/host/remove`, {
            method: 'post',
            body: JSON.stringify({session_id: 'session1'}),
        });
    });

    test('does not call the server when the call id is missing', async () => {
        await expect(hostRemoveParticipant(undefined, 'session1')).resolves.toEqual({});
        expect(mockedFetch).not.toHaveBeenCalled();
    });

    test('does not call the server when the session id is missing', async () => {
        await expect(hostRemoveParticipant('call1', undefined)).resolves.toEqual({});
        expect(mockedFetch).not.toHaveBeenCalled();
    });
});

describe('hostMuteAllParticipants', () => {
    test('posts to /host/mute-others without a body', async () => {
        await hostMuteAllParticipants('call1');
        expect(mockedFetch).toHaveBeenCalledWith(`${callBase}/host/mute-others`, {
            method: 'post',
        });
    });

    test('does not call the server when the call id is missing', async () => {
        await expect(hostMuteAllParticipants(undefined)).resolves.toEqual({});
        expect(mockedFetch).not.toHaveBeenCalled();
    });

    test('swallows request errors and logs them', async () => {
        const err = new Error('boom');
        mockedFetch.mockRejectedValue(err);

        await expect(hostMuteAllParticipants('call1')).resolves.toBeUndefined();
        expect(mockedLogErr).toHaveBeenCalledWith(err);
    });
});
