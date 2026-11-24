// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {CONNECTION_QUALITY} from 'src/clients/call/constants';
import {callEnded, localSessionClose, unInitialized, userLeft} from 'src/state/session/actions';

import {localSessionReconnected, localSessionReconnecting, sessionConnectionQualityChanged} from './actions';
import {reducer} from './reducer';
import {connectionStateForSession, degradedConnectionsForCurrentCall} from './selectors';

describe('connectionQuality reducer', () => {
    test('starts empty', () => {
        expect(reducer(undefined, {type: 'unknown'} as never)).toEqual({});
    });

    test('leaves the state as it is for other actions', () => {
        const state = reducer(undefined, sessionConnectionQualityChanged('channelA', 's1', CONNECTION_QUALITY.Poor));

        expect(reducer(state, {type: 'unknown'} as never)).toBe(state);
    });

    test.each([
        [CONNECTION_QUALITY.Poor, {channelA: {s1: 'poor'}}],
        [CONNECTION_QUALITY.Lost, {channelA: {s1: 'reconnecting'}}],
        [CONNECTION_QUALITY.Good, {}],
        [CONNECTION_QUALITY.Excellent, {}],
        [CONNECTION_QUALITY.Unknown, {}],
    ])('records %s quality as %j', (quality, expected) => {
        expect(reducer(undefined, sessionConnectionQualityChanged('channelA', 's1', quality))).toEqual(expected);
    });

    test('keeps sessions per channel', () => {
        let state = reducer(undefined, sessionConnectionQualityChanged('channelA', 's1', CONNECTION_QUALITY.Poor));
        state = reducer(state, sessionConnectionQualityChanged('channelA', 's2', CONNECTION_QUALITY.Lost));
        state = reducer(state, sessionConnectionQualityChanged('channelB', 's3', CONNECTION_QUALITY.Poor));

        expect(state).toEqual({
            channelA: {s1: 'poor', s2: 'reconnecting'},
            channelB: {s3: 'poor'},
        });
    });

    test.each([CONNECTION_QUALITY.Good, CONNECTION_QUALITY.Excellent])('removes a session once its quality is %s again', (quality) => {
        let state = reducer(undefined, sessionConnectionQualityChanged('channelA', 's1', CONNECTION_QUALITY.Poor));
        state = reducer(state, sessionConnectionQualityChanged('channelA', 's2', CONNECTION_QUALITY.Poor));

        state = reducer(state, sessionConnectionQualityChanged('channelA', 's1', quality));

        expect(state).toEqual({channelA: {s2: 'poor'}});
    });

    test('drops the channel once no session in it is degraded', () => {
        let state = reducer(undefined, sessionConnectionQualityChanged('channelA', 's1', CONNECTION_QUALITY.Poor));
        state = reducer(state, sessionConnectionQualityChanged('channelB', 's2', CONNECTION_QUALITY.Poor));

        state = reducer(state, sessionConnectionQualityChanged('channelA', 's1', CONNECTION_QUALITY.Good));

        expect(state).toEqual({channelB: {s2: 'poor'}});
    });

    test('moves between poor and reconnecting', () => {
        let state = reducer(undefined, sessionConnectionQualityChanged('channelA', 's1', CONNECTION_QUALITY.Poor));
        state = reducer(state, sessionConnectionQualityChanged('channelA', 's1', CONNECTION_QUALITY.Lost));
        expect(state).toEqual({channelA: {s1: 'reconnecting'}});

        state = reducer(state, sessionConnectionQualityChanged('channelA', 's1', CONNECTION_QUALITY.Poor));
        expect(state).toEqual({channelA: {s1: 'poor'}});
    });

    test('marks the local session reconnecting until it reconnects', () => {
        let state = reducer(undefined, sessionConnectionQualityChanged('channelA', 's2', CONNECTION_QUALITY.Poor));

        state = reducer(state, localSessionReconnecting('channelA', 's1'));
        expect(state).toEqual({channelA: {s1: 'reconnecting', s2: 'poor'}});

        state = reducer(state, localSessionReconnected('channelA', 's1'));
        expect(state).toEqual({channelA: {s2: 'poor'}});
    });

    test('removes a session when the user leaves', () => {
        let state = reducer(undefined, sessionConnectionQualityChanged('channelA', 's1', CONNECTION_QUALITY.Poor));
        state = reducer(state, sessionConnectionQualityChanged('channelA', 's2', CONNECTION_QUALITY.Poor));

        state = reducer(state, userLeft('channelA', 's1', 'u1'));

        expect(state).toEqual({channelA: {s2: 'poor'}});
    });

    test.each([
        ['the call ends', callEnded('channelA', 'callA')],
        ['the local session closes', localSessionClose('channelA')],
    ])('clears the channel when %s', (_, action) => {
        let state = reducer(undefined, sessionConnectionQualityChanged('channelA', 's1', CONNECTION_QUALITY.Poor));
        state = reducer(state, sessionConnectionQualityChanged('channelB', 's2', CONNECTION_QUALITY.Poor));

        state = reducer(state, action as never);

        expect(state).toEqual({channelB: {s2: 'poor'}});
    });

    test('resets on un-initialize', () => {
        const state = reducer(undefined, sessionConnectionQualityChanged('channelA', 's1', CONNECTION_QUALITY.Poor));

        expect(reducer(state, unInitialized())).toEqual({});
    });

    test.each([
        ['the quality is unchanged', sessionConnectionQualityChanged('channelA', 's1', CONNECTION_QUALITY.Poor)],
        ['the quality is unknown', sessionConnectionQualityChanged('channelA', 's1', CONNECTION_QUALITY.Unknown)],
        ['a good session stays good', sessionConnectionQualityChanged('channelA', 's2', CONNECTION_QUALITY.Good)],
        ['the session id is missing', sessionConnectionQualityChanged('channelA', '', CONNECTION_QUALITY.Lost)],
        ['the channel id is missing', sessionConnectionQualityChanged('', 's2', CONNECTION_QUALITY.Lost)],
        ['reconnecting has no session id', localSessionReconnecting('channelA', '')],
        ['a session that was not reconnecting reconnects', localSessionReconnected('channelA', 's2')],
        ['the session that left was not degraded', userLeft('channelA', 's2', 'u2')],
        ['the call ends in another channel', callEnded('channelB', 'callB')],
        ['the local session closes in another channel', localSessionClose('channelB')],
    ])('returns the same state when %s', (_, action) => {
        const state = reducer(undefined, sessionConnectionQualityChanged('channelA', 's1', CONNECTION_QUALITY.Poor));

        expect(reducer(state, action as never)).toBe(state);
    });
});

describe('connection quality selectors', () => {
    const stateWith = (connectionQuality: Record<string, Record<string, string>>, channelID: string) => ({
        'plugins-com.mattermost.calls': {
            connectionQuality,
            clientStateReducer: {channelID},
        },
    } as unknown as Parameters<typeof degradedConnectionsForCurrentCall>[0]);

    const connectionQuality = {
        channelA: {s1: 'poor', s2: 'reconnecting'},
        channelB: {s3: 'poor'},
    };

    test('degradedConnectionsForCurrentCall returns the degraded sessions in the current call', () => {
        expect(degradedConnectionsForCurrentCall(stateWith(connectionQuality, 'channelA'))).toEqual({s1: 'poor', s2: 'reconnecting'});
    });

    test('degradedConnectionsForCurrentCall is empty when no session in the current call is degraded', () => {
        expect(degradedConnectionsForCurrentCall(stateWith(connectionQuality, 'channelC'))).toEqual({});
    });

    test.each([
        ['s1', 'poor'],
        ['s2', 'reconnecting'],
        ['s3', 'good'],
        ['unknown', 'good'],
    ])('connectionStateForSession(%s) is %s in the current call', (sessionID, expected) => {
        expect(connectionStateForSession(stateWith(connectionQuality, 'channelA'), sessionID)).toBe(expected);
    });
});
