// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {cameraOnIdsForCurrentCall, isCameraOnForSession} from 'src/selectors';
import {callEnded, localSessionClose, unInitialized, userLeft} from 'src/state/session/actions';

import {userCameraOff, userCameraOn} from './actions';
import {reducer} from './reducer';

describe('cameraOnIDs reducer', () => {
    test('starts empty', () => {
        expect(reducer(undefined, {type: 'unknown'} as never)).toEqual({});
    });

    test('records sessions with the camera on, per channel', () => {
        let state = reducer(undefined, userCameraOn('channelA', 's1', 'u1'));
        state = reducer(state, userCameraOn('channelA', 's2', 'u2'));
        state = reducer(state, userCameraOn('channelB', 's3', 'u3'));

        expect(state).toEqual({
            channelA: {s1: true, s2: true},
            channelB: {s3: true},
        });
    });

    test('removes a session when its camera goes off', () => {
        let state = reducer(undefined, userCameraOn('channelA', 's1', 'u1'));
        state = reducer(state, userCameraOn('channelA', 's2', 'u2'));

        state = reducer(state, userCameraOff('channelA', 's1', 'u1'));

        expect(state).toEqual({channelA: {s2: true}});
    });

    test('drops the channel once no camera is on in it', () => {
        let state = reducer(undefined, userCameraOn('channelA', 's1', 'u1'));
        state = reducer(state, userCameraOn('channelB', 's2', 'u2'));

        state = reducer(state, userCameraOff('channelA', 's1', 'u1'));

        expect(state).toEqual({channelB: {s2: true}});
    });

    test('removes a session when the user leaves', () => {
        let state = reducer(undefined, userCameraOn('channelA', 's1', 'u1'));
        state = reducer(state, userCameraOn('channelA', 's2', 'u2'));

        state = reducer(state, userLeft('channelA', 's1', 'u1'));

        expect(state).toEqual({channelA: {s2: true}});
    });

    test.each([
        ['the call ends', callEnded('channelA', 'callA')],
        ['the local session closes', localSessionClose('channelA')],
    ])('clears the channel when %s', (_, action) => {
        let state = reducer(undefined, userCameraOn('channelA', 's1', 'u1'));
        state = reducer(state, userCameraOn('channelB', 's2', 'u2'));

        state = reducer(state, action as never);

        expect(state).toEqual({channelB: {s2: true}});
    });

    test('resets on un-initialize', () => {
        const state = reducer(undefined, userCameraOn('channelA', 's1', 'u1'));

        expect(reducer(state, unInitialized())).toEqual({});
    });

    test.each([
        ['the camera is already on', userCameraOn('channelA', 's1', 'u1')],
        ['the camera is already off', userCameraOff('channelA', 's2', 'u2')],
        ['the session that left had no camera on', userLeft('channelA', 's2', 'u2')],
        ['the channel has no camera on', userCameraOff('channelB', 's1', 'u1')],
        ['the call ends in another channel', callEnded('channelB', 'callB')],
        ['the local session closes in another channel', localSessionClose('channelB')],
    ])('returns the same state when %s', (_, action) => {
        const state = reducer(undefined, userCameraOn('channelA', 's1', 'u1'));

        expect(reducer(state, action as never)).toBe(state);
    });
});

describe('camera selectors', () => {
    const stateWith = (cameraOnIDs: Record<string, Record<string, true>>, channelID: string) => ({
        'plugins-com.mattermost.calls': {
            cameraOnIDs,
            clientStateReducer: {channelID},
        },
    } as unknown as Parameters<typeof cameraOnIdsForCurrentCall>[0]);

    const cameraOnIDs = {
        channelA: {s1: true},
        channelB: {s2: true},
    } as const;

    test('cameraOnIdsForCurrentCall returns the sessions with the camera on in the current call', () => {
        expect(cameraOnIdsForCurrentCall(stateWith(cameraOnIDs, 'channelA'))).toEqual({s1: true});
    });

    test('cameraOnIdsForCurrentCall is empty when no camera is on in the current call', () => {
        expect(cameraOnIdsForCurrentCall(stateWith(cameraOnIDs, 'channelC'))).toEqual({});
    });

    test.each([
        ['s1', true],
        ['s2', false],
        ['s3', false],
    ])('isCameraOnForSession(%s) is %s in the current call', (sessionID, expected) => {
        expect(isCameraOnForSession(stateWith(cameraOnIDs, 'channelA'), sessionID)).toBe(expected);
    });
});
