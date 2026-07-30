// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {CallPostStatus, CallsPostProps} from 'src/types/types';

import {CallCardState, getCallCardState} from './call_card_state';

const stubProps = (overrides: Partial<CallsPostProps> = {}): CallsPostProps => ({
    title: '',
    start_at: 1000,
    end_at: 0,
    participants: [],
    recordings: {},
    transcriptions: {},
    call_status: '',
    ...overrides,
});

describe('getCallCardState', () => {
    test.each([
        ['nobody answered', CallPostStatus.NoAnswer, CallCardState.NoAnswer],
        ['the caller canceled', CallPostStatus.CanceledByCaller, CallCardState.Canceled],
        ['the callee declined, which has no card state of its own yet', CallPostStatus.Declined, CallCardState.Ended],
        ['someone hung up', CallPostStatus.Ended, CallCardState.Ended],
        ['it predates the lifecycle states', '', CallCardState.Ended],
        ['it is still marked as ringing', CallPostStatus.Calling, CallCardState.Ended],
    ])('a call that ended because %s', (_, callStatus, expected) => {
        const callProps = stubProps({call_status: callStatus as CallPostStatus, end_at: 2000});

        expect(getCallCardState(callProps, 0)).toBe(expected);
    });

    test.each([
        [0, CallCardState.Calling],
        [1, CallCardState.Calling],
        [2, CallCardState.Active],
        [3, CallCardState.Active],
    ])('an ongoing call marked as ringing with %i participants', (numParticipants, expected) => {
        const callProps = stubProps({call_status: CallPostStatus.Calling});

        expect(getCallCardState(callProps, numParticipants)).toBe(expected);
    });

    test('an ongoing call with no status, as GM and channel calls always have', () => {
        expect(getCallCardState(stubProps(), 1)).toBe(CallCardState.Active);
    });
});
