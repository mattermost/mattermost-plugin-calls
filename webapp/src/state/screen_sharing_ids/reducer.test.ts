// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {callEnded, unInitialized} from 'src/state/common_actions';
import {userLeft} from 'src/state/sessions/actions';

import {userScreenShared, userScreenUnshared} from './actions';
import {reducer} from './reducer';

type ScreenSharingState = ReturnType<typeof reducer>;

describe('screen_sharing_ids reducer', () => {
    test('returns the initial state for an unknown action', () => {
        const state: ScreenSharingState = {channel1: 'session1'};
        expect(reducer(state, {type: 'unhandled'} as never)).toBe(state);
    });

    test('defaults to an empty state', () => {
        expect(reducer(undefined, {type: 'unhandled'} as never)).toEqual({});
    });

    test('UN_INITIALIZED clears all sharers', () => {
        const state: ScreenSharingState = {channel1: 'session1'};
        expect(reducer(state, unInitialized())).toEqual({});
    });

    test('USER_SCREEN_ON records the sharing session for the channel', () => {
        expect(reducer({}, userScreenShared('channel1', 'session1', 'user1'))).toEqual({
            channel1: 'session1',
        });
    });

    test('USER_SCREEN_ON keeps sharers in other channels and overwrites the same channel', () => {
        const state: ScreenSharingState = {channel1: 'session1', channel2: 'session2'};
        expect(reducer(state, userScreenShared('channel1', 'sessionX', 'userX'))).toEqual({
            channel1: 'sessionX',
            channel2: 'session2',
        });
    });

    test('USER_SCREEN_OFF clears the channel when the session matches the current sharer', () => {
        const state: ScreenSharingState = {channel1: 'session1', channel2: 'session2'};
        expect(reducer(state, userScreenUnshared('channel1', 'session1', 'user1'))).toEqual({
            channel2: 'session2',
        });
    });

    test('USER_SCREEN_OFF is a no-op when there is no current sharer', () => {
        const state: ScreenSharingState = {channel2: 'session2'};
        expect(reducer(state, userScreenUnshared('channel1', 'session1', 'user1'))).toBe(state);
    });

    test('USER_SCREEN_OFF is a no-op when a different session stops sharing', () => {
        const state: ScreenSharingState = {channel1: 'session1'};
        expect(reducer(state, userScreenUnshared('channel1', 'otherSession', 'user1'))).toBe(state);
    });

    test('USER_LEFT clears the channel when the sharer leaves', () => {
        const state: ScreenSharingState = {channel1: 'session1'};
        expect(reducer(state, userLeft('channel1', 'session1', 'user1'))).toEqual({});
    });

    test('USER_LEFT is a no-op when there is no current sharer', () => {
        const state: ScreenSharingState = {channel2: 'session2'};
        expect(reducer(state, userLeft('channel1', 'session1', 'user1'))).toBe(state);
    });

    test('USER_LEFT is a no-op when a non-sharing user leaves', () => {
        const state: ScreenSharingState = {channel1: 'session1'};
        expect(reducer(state, userLeft('channel1', 'otherSession', 'user2'))).toBe(state);
    });

    test('CALL_ENDED removes the sharer for the channel and leaves others untouched', () => {
        const state: ScreenSharingState = {channel1: 'session1', channel2: 'session2'};
        expect(reducer(state, callEnded('channel1', 'call1'))).toEqual({
            channel2: 'session2',
        });
    });

    test('CALL_ENDED does not mutate the previous state', () => {
        const state: ScreenSharingState = {channel1: 'session1'};
        reducer(state, callEnded('channel1', 'call1'));
        expect(state).toEqual({channel1: 'session1'});
    });
});
