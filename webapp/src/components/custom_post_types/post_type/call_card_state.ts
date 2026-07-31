// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {CallPostStatus, CallsPostProps} from 'src/types/types';

// There is deliberately no Declined state yet. The server can write call_status "declined"
// (POST /calls/{channel_id}/decline), but nothing in the webapp can trigger it: the incoming-call
// Decline button is deferred to a later phase along with the rest of the incoming DM call UI. Until
// then a declined call falls through to Ended and reports its duration like any other ended call.
export enum CallCardState {
    Calling = 'calling',
    Active = 'active',
    Ended = 'ended',
    NoAnswer = 'no_answer',
    Canceled = 'canceled',
}

// getCallCardState works out which of the call card's states to render for a call post.
//
// The server stamps call_status as "calling" when a DM call is created and only rewrites it
// once the call ends, so the post prop alone can't tell a ringing call apart from one that was
// answered. numSessions closes that gap: a ringing call has only the caller in it, and the
// second participant showing up is what makes it active. It's `<= 1` rather than `=== 1` so a
// viewer whose session list hasn't populated yet still sees the ringing state instead of
// briefly flashing the active one.
//
// This counts sessions rather than loaded profiles on purpose — a participant whose profile
// hasn't been fetched yet would otherwise drop out of the count and read as an unanswered call.
export function getCallCardState(callProps: CallsPostProps, numSessions: number): CallCardState {
    if (callProps.end_at > 0) {
        switch (callProps.call_status) {
        case CallPostStatus.NoAnswer:
            return CallCardState.NoAnswer;
        case CallPostStatus.CanceledByCaller:
            return CallCardState.Canceled;
        default:
            // Covers "ended", "declined", and calls that predate the lifecycle states.
            return CallCardState.Ended;
        }
    }

    if (callProps.call_status === CallPostStatus.Calling && numSessions <= 1) {
        return CallCardState.Calling;
    }

    return CallCardState.Active;
}
