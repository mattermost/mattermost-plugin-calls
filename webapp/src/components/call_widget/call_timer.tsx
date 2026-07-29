// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import './calling_state.scss';

import React, {useEffect} from 'react';
import {useIntl} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';
import {CALL_ANSWERED} from 'src/action_types';
import {useDMCallingState} from 'src/components/call_widget/use_calling_state_for_dm_call';
import {
    callAnsweredAtForCurrentCall,
    callTimerStartAtForCurrentCall,
    idForCurrentCall,
} from 'src/selectors';
import {getCallsWindow} from 'src/utils';

import CallDuration from './call_duration';

// CallTimer shows how long the current call has been going on for, except in a DM call that
// hasn't been answered yet. A phone call doesn't report a duration while it's still ringing, so
// the caller gets a "Calling…" label until the other party joins, and the timer then starts from
// zero rather than including the time spent ringing.
export default function CallTimer() {
    const {formatMessage} = useIntl();
    const dispatch = useDispatch();
    const {isDMCalling} = useDMCallingState();
    const callID = useSelector(idForCurrentCall);
    const answeredAt = useSelector(callAnsweredAtForCurrentCall);
    const startAt = useSelector(callTimerStartAtForCurrentCall);

    // Every call window has its own store, so one opened after the call was answered never
    // witnessed the other party joining. Seed it from the calls window so that it agrees with the
    // widget instead of counting from scratch.
    useEffect(() => {
        if (answeredAt || !callID) {
            return;
        }

        const sharedAnsweredAt = getCallsWindow().currentCallData?.answeredAt;
        if (sharedAnsweredAt) {
            dispatch({
                type: CALL_ANSWERED,
                data: {
                    callID,
                    answeredAt: sharedAnsweredAt,
                },
            });
        }
    }, [answeredAt, callID, dispatch]);

    if (isDMCalling) {
        return (
            <div className='callDurationContainer callsCallingText'>
                {formatMessage({defaultMessage: 'Calling…'})}
            </div>
        );
    }

    return (
        <CallDuration startAt={startAt}/>
    );
}
