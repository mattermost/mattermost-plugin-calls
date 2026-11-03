// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {AnyAction} from 'redux';
import {ADD_INCOMING_CALL, REMOVE_INCOMING_CALL} from 'src/action_types';
import {unInitialized} from 'src/state/session/actions';

import reducer from './reducers';

type State = ReturnType<typeof reducer>;

const channelID = 'dm-channel-id';
const callID = 'call-id';
const startAt = 1700000000000;

const apply = (...actions: AnyAction[]): State =>
    actions.reduce((state: State | undefined, action) => reducer(state, action), undefined) as State;

const incomingCall = (cID: string, cAllID: string) => ({
    type: ADD_INCOMING_CALL,
    data: {callID: cAllID, channelID: cID, callerID: 'caller-id', startAt, type: 'D'},
});

const removeIncomingCall = (cAllID: string) => ({
    type: REMOVE_INCOMING_CALL,
    data: {callID: cAllID},
});

describe('incomingCalls', () => {
    it('should add and remove incoming call notifications', () => {
        const state = apply(incomingCall(channelID, callID));

        expect(state.incomingCalls).toHaveLength(1);
        expect(state.incomingCalls[0].callID).toBe(callID);

        const state2 = apply(incomingCall(channelID, callID), removeIncomingCall(callID));

        expect(state2.incomingCalls).toHaveLength(0);
    });

    it('should clear all incoming call notifications on uninitialize', () => {
        const state = apply(
            incomingCall(channelID, callID),
            incomingCall('other-channel-id', 'other-call-id'),
            unInitialized(),
        );

        expect(state.incomingCalls).toHaveLength(0);
    });
});
