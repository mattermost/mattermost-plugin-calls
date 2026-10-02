// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {callEnded, unInitialized} from 'src/state/session/actions';

import {sipCallStatusChanged} from './actions';
import {reducer} from './reducer';

describe('sipCallStates reducer', () => {
    it('starts empty', () => {
        expect(reducer(undefined, {type: 'unknown'} as never)).toEqual({});
    });

    it('records the latest status per channel', () => {
        let state = reducer(undefined, sipCallStatusChanged('channelA', 'dialing', 100));
        expect(state).toEqual({channelA: {status: 'dialing', answeredAt: 0}});

        state = reducer(state, sipCallStatusChanged('channelA', 'ringing', 200));
        expect(state.channelA).toEqual({status: 'ringing', answeredAt: 0});

        state = reducer(state, sipCallStatusChanged('channelB', 'dialing', 300));
        expect(Object.keys(state)).toEqual(['channelA', 'channelB']);
    });

    it('sets answeredAt on the first active status only', () => {
        let state = reducer(undefined, sipCallStatusChanged('channelA', 'ringing', 100));
        state = reducer(state, sipCallStatusChanged('channelA', 'active', 200));
        expect(state.channelA).toEqual({status: 'active', answeredAt: 200});

        state = reducer(state, sipCallStatusChanged('channelA', 'active', 300));
        expect(state.channelA.answeredAt).toBe(200);

        state = reducer(state, sipCallStatusChanged('channelA', 'hangup', 400));
        expect(state.channelA).toEqual({status: 'hangup', answeredAt: 200});
    });

    it('returns the same state when nothing changed', () => {
        const state = reducer(undefined, sipCallStatusChanged('channelA', 'ringing', 100));
        expect(reducer(state, sipCallStatusChanged('channelA', 'ringing', 200))).toBe(state);
    });

    it('clears the channel when the call ends', () => {
        let state = reducer(undefined, sipCallStatusChanged('channelA', 'active', 100));
        state = reducer(state, sipCallStatusChanged('channelB', 'ringing', 100));

        const sameState = reducer(state, callEnded('channelC', 'callC'));
        expect(sameState).toBe(state);

        state = reducer(state, callEnded('channelA', 'callA'));
        expect(state).toEqual({channelB: {status: 'ringing', answeredAt: 0}});
    });

    it('resets on un-initialize', () => {
        const state = reducer(undefined, sipCallStatusChanged('channelA', 'active', 100));
        expect(reducer(state, unInitialized())).toEqual({});
    });
});
