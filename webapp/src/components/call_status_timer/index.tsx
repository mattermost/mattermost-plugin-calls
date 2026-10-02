// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {isDirectChannel} from 'mattermost-redux/utils/channel_utils';
import React, {useEffect} from 'react';
import {useIntl} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';
import {setDMCalleeAnsweredAt} from 'src/actions';
import {useDMCallingState} from 'src/components/use_dm_calling_state';
import {PHONE_CALL_SUBTITLE_SEPARATOR, usePhoneCallInfo} from 'src/components/use_phone_call_info';
import {
    callStartAtForCurrentCall,
    channelForCurrentCall,
    getCallIDForCurrentCall,
    isCurrentUserOwnerOfCurrentCall,
} from 'src/selectors';
import {getCallsClientInitTime, getCallsWindow, untranslatable} from 'src/utils';

import {ElapsedTimer} from './elapsed_timer';

interface Props {
    clientConnecting: boolean;
}

/**
 * Displays the duration of the current call, starting from when the call is answered;
 * shows "Calling…" for unanswered DM calls. The timer excludes time spent ringing
 * so it starts from zero once answered.
 */
export function CallStatusTimer(props: Props) {
    const {formatMessage} = useIntl();

    const dispatch = useDispatch();

    const {isDMCalling, dmCalleeAnsweredAt} = useDMCallingState();
    const phoneCall = usePhoneCallInfo();

    const callID = useSelector(getCallIDForCurrentCall);
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
        const sharedDMAnsweredAt = getCallsWindow().currentCallData?.dmCalleeAnsweredAt;
        if (sharedDMAnsweredAt) {
            dispatch(setDMCalleeAnsweredAt(callID, sharedDMAnsweredAt));
        }
    }, [dispatch, callID, dmCalleeAnsweredAt]);

    if (!channel) {
        return null;
    }

    if (phoneCall.isPhoneCall) {
        // The number and label stay under the title until the phone is answered,
        // then the timer takes the number's place.
        if (props.clientConnecting || phoneCall.isRinging) {
            return (
                <div
                    className='callStatusTimer'
                    data-testid='calls-widget-phone-call-subtitle'
                >
                    {phoneCall.subtitle}
                </div>
            );
        }

        return (
            <div
                className='callStatusTimer'
                style={{display: 'flex'}}
                data-testid='calls-widget-phone-call-subtitle'
            >
                <ElapsedTimer startAt={phoneCall.answeredAt}/>
                {phoneCall.phone?.label && <span>{untranslatable(PHONE_CALL_SUBTITLE_SEPARATOR)}{phoneCall.phone.label}</span>}
            </div>
        );
    }

    if (isDirectChannel(channel)) {
        if (props.clientConnecting) {
            return (
                <div className='callStatusTimer pulsingAnimation'>
                    {formatMessage({defaultMessage: 'Starting call…'})}
                </div>
            );
        }

        if (isDMCalling) {
            // If DM call is in calling state, display "Calling…"
            // don't show the elapsed timer yet.
            return (
                <div className='callStatusTimer pulsingAnimation'>
                    {formatMessage({defaultMessage: 'Calling…'})}
                </div>
            );
        }

        // For the caller that's when the other party's session showed up (recorded by the joinUser
        // thunk); for the callee it's their own join, i.e. when their calls client was initialized.
        const answeredAt = isOwner ? dmCalleeAnsweredAt : getCallsClientInitTime();
        return (
            <ElapsedTimer
                classname='callStatusTimer'
                startAt={answeredAt || startAt}
            />
        );
    }

    return (
        <ElapsedTimer
            classname='callStatusTimer'
            startAt={startAt}
        />
    );
}
