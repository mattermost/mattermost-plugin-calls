// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {isDirectChannel} from 'mattermost-redux/utils/channel_utils';
import React, {useEffect} from 'react';
import {useIntl} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';
import {setDMCalleeAnsweredAt} from 'src/actions';
import {useDMCallingState} from 'src/components/use_dm_calling_state';
import {
    callStartAtForCurrentCall,
    channelForCurrentCall,
    idForCurrentCall,
    isCurrentUserOwnerOfCurrentCall,
} from 'src/selectors';
import {getCallsClientInitTime, getCallsWindow} from 'src/utils';

import {ElapsedTimer} from './elapsed_timer';

/**
 * Displays the duration of the current call, starting from when the call is answered;
 * shows "Calling…" for unanswered DM calls. The timer excludes time spent ringing
 * so it starts from zero once answered.
 */
export function CallStatusTimer() {
    const {formatMessage} = useIntl();

    const dispatch = useDispatch();

    const {isDMCalling, dmCalleeAnsweredAt} = useDMCallingState();

    const callID = useSelector(idForCurrentCall);
    const channel = useSelector(channelForCurrentCall);
    const startAt = useSelector(callStartAtForCurrentCall);
    const isOwner = useSelector(isCurrentUserOwnerOfCurrentCall);

    useEffect(() => {
        if (dmCalleeAnsweredAt || !callID) {
            return;
        }

        // The answered timestamp is client-only and shared through the calls window, not the server.
        // Since each call window has its own store, one opened after the other party joins misses
        // DM_CALLEE_ANSWERED_AT. Seed its store from the shared timestamp so the expanded view and widget
        // stay in sync instead of restarting the timer from zero.
        const sharedDMAnsweredAt = getCallsWindow().currentCallData?.answeredAt;
        if (sharedDMAnsweredAt) {
            dispatch(setDMCalleeAnsweredAt(callID, sharedDMAnsweredAt));
        }
    }, [dispatch, callID, dmCalleeAnsweredAt]);

    // If DM call is in calling state, display "Calling…"
    // don't show the elapsed timer yet.
    if (isDMCalling) {
        return (
            <div className='callStatusTimerCallingText pulsingAnimation'>
                {formatMessage({defaultMessage: 'Calling…'})}
            </div>
        );
    }

    // For the caller that's when the other party's session showed up (recorded in handleUserJoined);
    // for the callee it's their own join, which is when their calls client was initialized.
    if (channel && isDirectChannel(channel)) {
        const answeredAt = isOwner ? dmCalleeAnsweredAt : getCallsClientInitTime();

        return (
            <ElapsedTimer startAt={answeredAt || startAt}/>
        );
    }

    return (
        <ElapsedTimer startAt={startAt}/>
    );
}
