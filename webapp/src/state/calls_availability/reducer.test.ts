// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {unInitialized} from 'src/state/common_actions';

import {channelCallsAvailabilityUpdated} from './actions';
import {reducer} from './reducer';

type CallsAvailabilityState = ReturnType<typeof reducer>;

describe('calls_availability reducer', () => {
    test('returns the initial state for an unknown action', () => {
        const state: CallsAvailabilityState = {channel1: {channelID: 'channel1', enabled: true}};
        expect(reducer(state, {type: 'unhandled'} as never)).toBe(state);
    });

    test('defaults to an empty state', () => {
        expect(reducer(undefined, {type: 'unhandled'} as never)).toEqual({});
    });

    test('UN_INITIALIZED clears availability for all channels', () => {
        const state: CallsAvailabilityState = {channel1: {channelID: 'channel1', enabled: true}};
        expect(reducer(state, unInitialized())).toEqual({});
    });

    test('CHANNEL_CALLS_AVAILABILITY_UPDATED stores availability keyed by channel', () => {
        expect(reducer({}, channelCallsAvailabilityUpdated('channel1', false))).toEqual({
            channel1: {channelID: 'channel1', enabled: false},
        });
    });

    test('CHANNEL_CALLS_AVAILABILITY_UPDATED keeps availability for other channels', () => {
        const state: CallsAvailabilityState = {channel1: {channelID: 'channel1', enabled: true}};
        expect(reducer(state, channelCallsAvailabilityUpdated('channel2', false))).toEqual({
            channel1: {channelID: 'channel1', enabled: true},
            channel2: {channelID: 'channel2', enabled: false},
        });
    });

    test('CHANNEL_CALLS_AVAILABILITY_UPDATED overwrites availability for the same channel', () => {
        const state: CallsAvailabilityState = {channel1: {channelID: 'channel1', enabled: true}};
        expect(reducer(state, channelCallsAvailabilityUpdated('channel1', false))).toEqual({
            channel1: {channelID: 'channel1', enabled: false},
        });
    });
});
