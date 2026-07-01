// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {callEnded, unInitialized} from 'src/state/common_actions';

import {hostChanged} from './actions';
import {reducer} from './reducer';

type HostsState = ReturnType<typeof reducer>;

describe('hosts reducer', () => {
    test('returns the initial state for an unknown action', () => {
        const state: HostsState = {channel1: {hostID: 'host1', hostChangeAt: 1}};
        expect(reducer(state, {type: 'unhandled'} as never)).toBe(state);
    });

    test('defaults to an empty state', () => {
        expect(reducer(undefined, {type: 'unhandled'} as never)).toEqual({});
    });

    test('UN_INITIALIZED clears all hosts', () => {
        const state: HostsState = {channel1: {hostID: 'host1', hostChangeAt: 1}};
        expect(reducer(state, unInitialized())).toEqual({});
    });

    test('HOST_CHANGED records the host and the change timestamp keyed by channel', () => {
        expect(reducer({}, hostChanged('channel1', 'host1', 1000))).toEqual({
            channel1: {hostID: 'host1', hostChangeAt: 1000},
        });
    });

    test('HOST_CHANGED keeps hosts for other channels', () => {
        const state: HostsState = {channel1: {hostID: 'host1', hostChangeAt: 1}};
        expect(reducer(state, hostChanged('channel2', 'host2', 2))).toEqual({
            channel1: {hostID: 'host1', hostChangeAt: 1},
            channel2: {hostID: 'host2', hostChangeAt: 2},
        });
    });

    test('HOST_CHANGED overwrites the host for the same channel', () => {
        const state: HostsState = {channel1: {hostID: 'host1', hostChangeAt: 1}};
        expect(reducer(state, hostChanged('channel1', 'host2', 5))).toEqual({
            channel1: {hostID: 'host2', hostChangeAt: 5},
        });
    });

    test('HOST_CHANGED only persists the hostID and hostChangeAt fields', () => {
        const result = reducer({}, hostChanged('channel1', 'host1', 1000));
        expect(Object.keys(result.channel1)).toEqual(['hostID', 'hostChangeAt']);
    });

    test('CALL_ENDED removes the host for the channel and leaves others untouched', () => {
        const state: HostsState = {
            channel1: {hostID: 'host1', hostChangeAt: 1},
            channel2: {hostID: 'host2', hostChangeAt: 2},
        };
        expect(reducer(state, callEnded('channel1', 'call1'))).toEqual({
            channel2: {hostID: 'host2', hostChangeAt: 2},
        });
    });

    test('CALL_ENDED does not mutate the previous state', () => {
        const state: HostsState = {channel1: {hostID: 'host1', hostChangeAt: 1}};
        reducer(state, callEnded('channel1', 'call1'));
        expect(state).toEqual({channel1: {hostID: 'host1', hostChangeAt: 1}});
    });
});
