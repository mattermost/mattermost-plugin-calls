// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import './post_type_phone_call.scss';

import {Post} from '@mattermost/types/posts';
import {GlobalState} from '@mattermost/types/store';
import {UserProfile} from '@mattermost/types/users';
import classNames from 'classnames';
import {DateTime, Duration as LuxonDuration} from 'luxon';
import Preferences from 'mattermost-redux/constants/preferences';
import {get, getBool} from 'mattermost-redux/selectors/entities/preferences';
import {getCurrentUserId, getUser} from 'mattermost-redux/selectors/entities/users';
import React, {useCallback, useEffect} from 'react';
import {useIntl} from 'react-intl';
import {shallowEqual, useDispatch, useSelector} from 'react-redux';
import {loadProfilesByIdsIfMissing} from 'src/actions';
import ConnectedProfiles from 'src/components/connected_profiles';
import CompassIcon from 'src/components/icons/compassIcon';
import LeaveCallIcon from 'src/components/icons/leave_call_icon';
import Timestamp from 'src/components/timestamp';
import {MESSAGE_DISPLAY, MESSAGE_DISPLAY_COMPACT, MESSAGE_DISPLAY_DEFAULT} from 'src/constants';
import {dialFromUI, phoneDialingSupported} from 'src/phone_call';
import {getPhoneCallPropsFromPostProps, phoneNumberForDisplay} from 'src/phone_utils';
import {channelIDForCurrentCall, profilesInCallInChannel, sipCallStateForCallInChannel} from 'src/selectors';
import {CallPostStatus, CallsPostProps, PhoneCallProps} from 'src/types/types';
import {callStartedTimestampFn, getCallPropsFromPost, getCallsClient, getUserDisplayName, toHuman, untranslatable} from 'src/utils';

export enum PhoneCardState {
    Calling = 'calling',
    Active = 'active',
    Ended = 'ended',
    Canceled = 'canceled',
    NoAnswer = 'no_answer',
    Declined = 'declined',
    Failed = 'failed',
}

// Once the call is over the server has recorded why on the post; before that
// only the caller's own client knows whether the phone has picked up.
export function getPhoneCardState(callProps: CallsPostProps, answeredAt: number): PhoneCardState {
    if (callProps.end_at > 0) {
        switch (callProps.call_status) {
        case CallPostStatus.NoAnswer:
            return PhoneCardState.NoAnswer;
        case CallPostStatus.Canceled:
            return PhoneCardState.Canceled;
        case CallPostStatus.Declined:
            return PhoneCardState.Declined;
        case CallPostStatus.Failed:
            return PhoneCardState.Failed;
        default:
            return PhoneCardState.Ended;
        }
    }

    return answeredAt > 0 ? PhoneCardState.Active : PhoneCardState.Calling;
}

const ENDED_STATES: ReadonlyArray<PhoneCardState> = [
    PhoneCardState.Ended,
    PhoneCardState.Canceled,
    PhoneCardState.NoAnswer,
    PhoneCardState.Declined,
    PhoneCardState.Failed,
];

const Divider = () => <span className='PhoneCallCard__divider'>{untranslatable('•')}</span>;

interface Props {
    post: Post,
    isRHS: boolean,
}

export const PostTypePhoneCall = ({post, isRHS}: Props) => {
    const intl = useIntl();
    const {formatMessage} = intl;
    const dispatch = useDispatch();

    const callProps = getCallPropsFromPost(post);
    const phone: PhoneCallProps = getPhoneCallPropsFromPostProps(callProps) ?? {number: '', displayNumber: '', label: '', targetUserID: ''};

    const currentUserID = useSelector(getCurrentUserId);
    const targetUser = useSelector((state: GlobalState) => (phone.targetUserID ? getUser(state, phone.targetUserID) : undefined));
    const connectedID = useSelector(channelIDForCurrentCall);
    const sipState = useSelector((state: GlobalState) => sipCallStateForCallInChannel(state, post.channel_id));
    const profiles = useSelector((state: GlobalState) => profilesInCallInChannel(state, post.channel_id), shallowEqual);
    const militaryTime = useSelector((state: GlobalState) => getBool(state, Preferences.CATEGORY_DISPLAY_SETTINGS, Preferences.USE_MILITARY_TIME, false));
    const compactDisplay = useSelector((state: GlobalState) => get(state, Preferences.CATEGORY_DISPLAY_SETTINGS, MESSAGE_DISPLAY, MESSAGE_DISPLAY_DEFAULT)) === MESSAGE_DISPLAY_COMPACT;

    useEffect(() => {
        if (phone.targetUserID) {
            dispatch(loadProfilesByIdsIfMissing([phone.targetUserID]));
        }
    }, [dispatch, phone.targetUserID]);

    const timestampFn = useCallback(() => callStartedTimestampFn(intl, callProps.start_at), [intl, callProps.start_at]);

    const cardState = getPhoneCardState(callProps, sipState?.answeredAt ?? 0);
    const hasEnded = ENDED_STATES.includes(cardState);

    // The post is authored by whoever dialed. The only other person who can see
    // it is the one who was called, through the copy posted in their DM.
    const isCaller = post.user_id === currentUserID;
    const inCall = connectedID === post.channel_id;

    const number = phoneNumberForDisplay(phone);
    const name = (targetUser && getUserDisplayName(targetUser)) || number;

    const hourCycle: 'h23' | 'h12' = militaryTime ? 'h23' : 'h12';
    const timeFormat = {...DateTime.TIME_24_SIMPLE, hourCycle};

    const onHangUp = () => {
        const callsClient = getCallsClient();
        if (callsClient) {
            callsClient.disconnect();
        } else if (window.desktopAPI?.leaveCall) {
            window.desktopAPI.leaveCall();
        }
    };

    const onCallAgain = () => {
        dialFromUI(phone.number, {targetUserID: phone.targetUserID, label: phone.label});
    };

    let title: string;
    switch (cardState) {
    case PhoneCardState.Calling:
        title = formatMessage({defaultMessage: 'Calling {name}…'}, {name});
        break;
    case PhoneCardState.Active:
        title = formatMessage({defaultMessage: 'Call started'});
        break;
    case PhoneCardState.Ended:
        title = formatMessage({defaultMessage: 'Call ended'});
        break;
    case PhoneCardState.Canceled:
        title = isCaller ? formatMessage({defaultMessage: 'Call canceled'}) : formatMessage({defaultMessage: 'Missed call'});
        break;
    case PhoneCardState.NoAnswer:
        title = isCaller ? formatMessage({defaultMessage: 'No answer'}) : formatMessage({defaultMessage: 'Missed call'});
        break;
    case PhoneCardState.Declined:
        title = formatMessage({defaultMessage: 'Call declined'});
        break;
    case PhoneCardState.Failed:
        title = formatMessage({defaultMessage: 'Call failed'});
        break;
    default: {
        const exhaustive: never = cardState;
        throw new Error(`unhandled phone card state: ${exhaustive}`);
    }
    }

    const numberAndLabel = (
        <>
            <span>{number}</span>
            {phone.label &&
                <>
                    <Divider/>
                    <span>{phone.label}</span>
                </>
            }
        </>
    );

    const sinceStartSubMessage = (
        <>
            <Timestamp
                timestampFn={timestampFn}
                interval={5000}
            />
            <Divider/>
            {numberAndLabel}
        </>
    );

    const durationSubMessage = (
        <>
            <span>
                {formatMessage(
                    {defaultMessage: 'Ended at {endTime}'},
                    {endTime: DateTime.fromMillis(callProps.end_at).toLocaleString(timeFormat)},
                )}
            </span>
            <Divider/>
            <span>
                {formatMessage(
                    {defaultMessage: 'Lasted {callDuration}'},
                    {callDuration: toHuman(intl, LuxonDuration.fromMillis(callProps.end_at - callProps.start_at), 'minutes', {unitDisplay: 'long'})},
                )}
            </span>
        </>
    );

    let subMessage: JSX.Element;
    switch (cardState) {
    case PhoneCardState.Calling:
    case PhoneCardState.Active:
    case PhoneCardState.Canceled:
        subMessage = sinceStartSubMessage;
        break;
    case PhoneCardState.Ended:
        // Without a start there is no duration worth reporting.
        subMessage = callProps.start_at > 0 ? durationSubMessage : numberAndLabel;
        break;
    case PhoneCardState.NoAnswer:
    case PhoneCardState.Declined:
    case PhoneCardState.Failed:
        subMessage = numberAndLabel;
        break;
    default: {
        const exhaustive: never = cardState;
        throw new Error(`unhandled phone card state: ${exhaustive}`);
    }
    }

    const recordings = Object.values(callProps.recordings).filter((job) => Boolean(job.file_id));
    const transcriptions = Object.values(callProps.transcriptions).filter((job) => Boolean(job.file_id));

    // The phone has no profile of its own, so the person it belongs to stands in for it.
    const avatars: UserProfile[] = targetUser && !profiles.some((p) => p.id === targetUser.id) ? [...profiles, targetUser] : profiles;

    const showCallAgain = hasEnded && isCaller && Boolean(phone.number) && phoneDialingSupported();

    return (
        <>
            {compactDisplay && !isRHS && <br/>}
            <div
                className='PhoneCallCard'
                data-testid='phone-call-card'
            >
                <div className='PhoneCallCard__left'>
                    <div className={classNames('PhoneCallCard__indicator', {ended: hasEnded})}>
                        <CompassIcon icon={hasEnded ? 'phone-hangup' : 'phone'}/>
                    </div>
                    <div className='PhoneCallCard__text'>
                        <span
                            className='PhoneCallCard__title'
                            data-testid='phone-call-card-title'
                        >
                            {title}
                        </span>
                        <div
                            className='PhoneCallCard__subtitle'
                            data-testid='phone-call-card-subtitle'
                        >
                            {subMessage}
                        </div>
                    </div>
                </div>
                <div className='PhoneCallCard__right'>
                    {cardState === PhoneCardState.Active && inCall &&
                        <>
                            <div className='PhoneCallCard__profiles'>
                                <ConnectedProfiles
                                    profiles={avatars}
                                    size={28}
                                    fontSize={14}
                                    border={true}
                                    maxShowedProfiles={3}
                                />
                            </div>
                            <button
                                className='PhoneCallCard__button hangUp'
                                onClick={onHangUp}
                                aria-label={formatMessage({defaultMessage: 'Hang up'})}
                            >
                                <LeaveCallIcon style={{fill: 'var(--button-color)', width: '18px', height: '16px'}}/>
                                <span>{formatMessage({defaultMessage: 'Hang up'})}</span>
                            </button>
                        </>
                    }
                    {showCallAgain &&
                        <button
                            className='PhoneCallCard__button callAgain'
                            onClick={onCallAgain}
                            aria-label={formatMessage({defaultMessage: 'Call again'})}
                        >
                            <CompassIcon
                                icon='phone'
                                style={{fontSize: '16px'}}
                            />
                            <span>{formatMessage({defaultMessage: 'Call again'})}</span>
                        </button>
                    }
                    {recordings.length > 0 &&
                        <div className='PhoneCallCard__artifacts'>
                            <CompassIcon
                                icon='file-video-outline'
                                style={{fontSize: '16px'}}
                            />
                            <span>{formatMessage({defaultMessage: '{count, plural, =1 {# recording} other {# recordings}}'}, {count: recordings.length})}</span>
                        </div>
                    }
                    {transcriptions.length > 0 &&
                        <div className='PhoneCallCard__artifacts'>
                            <CompassIcon
                                icon='file-text-outline'
                                style={{fontSize: '16px'}}
                            />
                            <span>{formatMessage({defaultMessage: '{count, plural, =1 {# transcription} other {# transcriptions}}'}, {count: transcriptions.length})}</span>
                        </div>
                    }
                </div>
            </div>
        </>
    );
};
