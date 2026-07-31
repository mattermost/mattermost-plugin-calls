// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {AnyAction} from 'redux';
import {CALL_END, CALL_STATE, DM_CALLEE_ANSWERED_AT, UNINIT} from 'src/action_types';

import reducer from './reducers';

type State = ReturnType<typeof reducer>;

const channelID = 'dm-channel-id';
const callID = 'call-id';
const ownerID = 'user-id';
const startAt = 1700000000000;
const answeredAt = startAt + 20_000;

const apply = (...actions: AnyAction[]): State =>
    actions.reduce((state: State | undefined, action) => reducer(state, action), undefined) as State;

// Mirrors what loadCallState dispatches, which is what the client gets back after asking for the
// call state on every websocket reconnect.
const callState = (ID: string) => ({
    type: CALL_STATE,
    data: {ID, channelID, startAt, ownerID, threadID: ''},
});

const callAnswered = (ID: string, at: number) => ({
    type: DM_CALLEE_ANSWERED_AT,
    data: {callID: ID, answeredAt: at},
});

// callEnd() is the only dispatcher of CALL_END and always includes the call ID.
const callEnd = (ID: string) => ({
    type: CALL_END,
    data: {channelID, callID: ID},
});

describe('dmCalleeAnsweredAt', () => {
    it('should record when the call was answered', () => {
        const state = apply(callState(callID), callAnswered(callID, answeredAt));

        expect(state.dmCalleeAnsweredAt).toEqual({[callID]: answeredAt});
    });

    // The regression this keying protects against: a websocket reconnect re-requests the call
    // state, and the resulting CALL_STATE must not restart the caller's duration timer.
    it('should survive a CALL_STATE resync of an already answered call', () => {
        const state = apply(callState(callID), callAnswered(callID, answeredAt), callState(callID));

        expect(state.dmCalleeAnsweredAt).toEqual({[callID]: answeredAt});
    });

    it('should not let a new call in the same channel inherit the previous answer time', () => {
        const nextCallID = 'next-call-id';
        const state = apply(
            callState(callID),
            callAnswered(callID, answeredAt),
            callEnd(callID),
            callState(nextCallID),
        );

        expect(state.dmCalleeAnsweredAt[nextCallID]).toBeUndefined();
        expect(state.dmCalleeAnsweredAt).toEqual({});
    });

    it('should keep the answer time of an ongoing call when another call ends', () => {
        const state = apply(callState(callID), callAnswered(callID, answeredAt), callEnd('other-call-id'));

        expect(state.dmCalleeAnsweredAt).toEqual({[callID]: answeredAt});
    });

    it('should drop everything on UNINIT', () => {
        const state = apply(callState(callID), callAnswered(callID, answeredAt), {type: UNINIT});

        expect(state.dmCalleeAnsweredAt).toEqual({});
    });
});
