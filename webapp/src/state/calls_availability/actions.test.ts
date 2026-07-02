// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {type GlobalState} from '@mattermost/types/store';
import {getCurrentChannelId} from 'mattermost-redux/selectors/entities/common';
import RestClient from 'src/clients/rest';
import {logErr} from 'src/log';
import {getPluginPath} from 'src/utils';

import {CHANNEL_CALLS_AVAILABILITY_UPDATED} from './action_types';
import {channelCallsAvailabilityUpdated, toggleCallsAvailabilityForChannel} from './actions';
import {callsNotAvailableInChannel} from './selectors';

jest.mock('src/clients/rest', () => ({
    __esModule: true,
    default: {
        fetch: jest.fn(),
    },
}));

jest.mock('src/log', () => ({
    logErr: jest.fn(),
}));

jest.mock('mattermost-redux/selectors/entities/common', () => ({
    ...jest.requireActual('mattermost-redux/selectors/entities/common'),
    getCurrentChannelId: jest.fn(),
}));

jest.mock('./selectors', () => ({
    callsNotAvailableInChannel: jest.fn(),
}));

const mockedFetch = RestClient.fetch as jest.Mock;
const mockedLogErr = logErr as jest.Mock;
const mockedGetCurrentChannelId = getCurrentChannelId as jest.Mock;
const mockedCallsNotAvailableInChannel = callsNotAvailableInChannel as jest.Mock;

const dispatch = jest.fn();
const getState = jest.fn(() => ({} as GlobalState));

beforeEach(() => {
    mockedGetCurrentChannelId.mockReturnValue('channel1');
});

describe('channelCallsAvailabilityUpdated', () => {
    test('defaults enabled to true when omitted', () => {
        expect(channelCallsAvailabilityUpdated('channel1')).toEqual({
            type: CHANNEL_CALLS_AVAILABILITY_UPDATED,
            data: {channelID: 'channel1', enabled: true},
        });
    });

    test('preserves an explicit false', () => {
        expect(channelCallsAvailabilityUpdated('channel1', false)).toEqual({
            type: CHANNEL_CALLS_AVAILABILITY_UPDATED,
            data: {channelID: 'channel1', enabled: false},
        });
    });

    test('preserves an explicit true', () => {
        expect(channelCallsAvailabilityUpdated('channel1', true).data.enabled).toBe(true);
    });
});

describe('toggleCallsAvailabilityForChannel', () => {
    test('posts the negated current availability and dispatches the server response', async () => {
        // Calls are currently unavailable, so toggling should request enabled: true.
        mockedCallsNotAvailableInChannel.mockReturnValue(true);
        mockedFetch.mockResolvedValue({enabled: true});

        await toggleCallsAvailabilityForChannel()(dispatch, getState);

        expect(mockedFetch).toHaveBeenCalledWith(`${getPluginPath()}/channel1`, {
            method: 'post',
            body: JSON.stringify({enabled: true}),
        });
        expect(dispatch).toHaveBeenCalledWith(channelCallsAvailabilityUpdated('channel1', true));
    });

    test('dispatches the enabled value returned by the server, not the requested one', async () => {
        mockedCallsNotAvailableInChannel.mockReturnValue(false);
        mockedFetch.mockResolvedValue({enabled: false});

        await toggleCallsAvailabilityForChannel()(dispatch, getState);

        expect(mockedFetch).toHaveBeenCalledWith(`${getPluginPath()}/channel1`, {
            method: 'post',
            body: JSON.stringify({enabled: false}),
        });
        expect(dispatch).toHaveBeenCalledWith(channelCallsAvailabilityUpdated('channel1', false));
    });

    test('logs and swallows request errors without dispatching', async () => {
        const err = new Error('boom');
        mockedCallsNotAvailableInChannel.mockReturnValue(true);
        mockedFetch.mockRejectedValue(err);

        await toggleCallsAvailabilityForChannel()(dispatch, getState);

        expect(mockedLogErr).toHaveBeenCalledWith(err);
        expect(dispatch).not.toHaveBeenCalled();
    });
});
