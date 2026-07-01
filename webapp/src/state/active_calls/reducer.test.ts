// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {callEnded, unInitialized} from 'src/state/common_actions';

import {activeCallAdded} from './actions';
import {type ActiveCall, type ActiveCalls, reducer} from './reducer';

const callOne: Omit<ActiveCall, 'channelID'> = {
    callID: 'call1',
    startAt: 100,
    threadID: 'thread1',
    ownerID: 'owner1',
};
const callTwo: Omit<ActiveCall, 'channelID'> = {
    callID: 'call2',
    startAt: 200,
    threadID: 'thread2',
    ownerID: 'owner2',
};

describe('active_calls reducer', () => {
    test('returns the initial state for an unknown action', () => {
        const state: ActiveCalls = {channel1: {channelID: 'channel1', ...callOne}};
        expect(reducer(state, {type: 'unhandled'} as never)).toBe(state);
    });

    test('defaults to an empty state', () => {
        expect(reducer(undefined, {type: 'unhandled'} as never)).toEqual({});
    });

    test('UN_INITIALIZED clears all calls', () => {
        const state: ActiveCalls = {channel1: {channelID: 'channel1', ...callOne}};
        expect(reducer(state, unInitialized())).toEqual({});
    });

    test('ACTIVE_CALL_ADDED adds a call keyed by channel id', () => {
        expect(reducer({}, activeCallAdded('channel1', callOne))).toEqual({
            channel1: {channelID: 'channel1', ...callOne},
        });
    });

    test('ACTIVE_CALL_ADDED keeps calls in other channels', () => {
        const state: ActiveCalls = {channel1: {channelID: 'channel1', ...callOne}};
        expect(reducer(state, activeCallAdded('channel2', callTwo))).toEqual({
            channel1: {channelID: 'channel1', ...callOne},
            channel2: {channelID: 'channel2', ...callTwo},
        });
    });

    test('ACTIVE_CALL_ADDED overwrites an existing call for the same channel', () => {
        const state: ActiveCalls = {channel1: {channelID: 'channel1', ...callOne}};
        expect(reducer(state, activeCallAdded('channel1', callTwo))).toEqual({
            channel1: {channelID: 'channel1', ...callTwo},
        });
    });

    test('ACTIVE_CALL_ADDED does not mutate the previous state', () => {
        const state: ActiveCalls = {channel1: {channelID: 'channel1', ...callOne}};
        reducer(state, activeCallAdded('channel2', callTwo));
        expect(state).toEqual({channel1: {channelID: 'channel1', ...callOne}});
    });

    test('CALL_ENDED removes the call for the channel and leaves others untouched', () => {
        const state: ActiveCalls = {
            channel1: {channelID: 'channel1', ...callOne},
            channel2: {channelID: 'channel2', ...callTwo},
        };
        expect(reducer(state, callEnded('channel1', 'call1'))).toEqual({
            channel2: {channelID: 'channel2', ...callTwo},
        });
    });

    test('CALL_ENDED is a no-op for a channel without a call', () => {
        const state: ActiveCalls = {channel1: {channelID: 'channel1', ...callOne}};
        expect(reducer(state, callEnded('channel2', 'call2'))).toEqual(state);
    });

    test('CALL_ENDED does not mutate the previous state', () => {
        const state: ActiveCalls = {channel1: {channelID: 'channel1', ...callOne}};
        reducer(state, callEnded('channel1', 'call1'));
        expect(state).toEqual({channel1: {channelID: 'channel1', ...callOne}});
    });
});
