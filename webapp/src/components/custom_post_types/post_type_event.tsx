// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/* eslint-disable max-lines */

import {Post} from '@mattermost/types/posts';
import {GlobalState} from '@mattermost/types/store';
import {DateTime, Duration as LuxonDuration} from 'luxon';
import Preferences from 'mattermost-redux/constants/preferences';
import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {get, getBool} from 'mattermost-redux/selectors/entities/preferences';
import {getCurrentUserId, getUser, isCurrentUserSystemAdmin} from 'mattermost-redux/selectors/entities/users';
import React, {useCallback} from 'react';
import {OverlayTrigger, Tooltip} from 'react-bootstrap';
import {useIntl} from 'react-intl';
import {shallowEqual, useSelector} from 'react-redux';
import ConnectedProfiles from 'src/components/connected_profiles';
import DotMenu, {DotMenuButton} from 'src/components/dot_menu/dot_menu';
import ActiveCallIcon from 'src/components/icons/active_call_icon';
import CallIcon from 'src/components/icons/call_icon';
import CompassIcon from 'src/components/icons/compassIcon';
import LeaveCallIcon from 'src/components/icons/leave_call_icon';
import {useDismissJoin} from 'src/components/incoming_calls/hooks';
import {LeaveCallMenu} from 'src/components/leave_call_menu';
import {Header, SubHeader} from 'src/components/shared';
import Timestamp from 'src/components/timestamp';
import {MESSAGE_DISPLAY, MESSAGE_DISPLAY_COMPACT, MESSAGE_DISPLAY_DEFAULT} from 'src/constants';
import {
    channelIDForCurrentCall,
    hostIDForCallInChannel,
    idForCallInChannel,
    isCloudProfessionalOrEnterpriseorEnterpriseAdvanceOrTrial,
    maxParticipants,
    numUsersInCallInChannel,
    profilesInCallInChannel,
} from 'src/selectors';
import {CallPostStatus, CallsPostProps} from 'src/types/types';
import {
    callStartedTimestampFn,
    getCallPropsFromPost,
    getCallsClient,
    getUserDisplayName,
    getUserIdFromDM,
    isDMChannel,
    toHuman,
    untranslatable,
} from 'src/utils';
import styled, {css} from 'styled-components';

enum CallCardState {
    Calling = 'calling',
    Active = 'active',
    NoAnswer = 'no_answer',
    Canceled = 'canceled',
    Declined = 'declined',
    Ended = 'ended',
}

export function getCallCardState(callProps: CallsPostProps, numUsers: number): CallCardState {
    if (callProps.end_at > 0) {
        switch (callProps.call_status) {
        case CallPostStatus.NoAnswer:
            return CallCardState.NoAnswer;
        case CallPostStatus.CanceledByCaller:
            return CallCardState.Canceled;
        case CallPostStatus.Declined:
            return CallCardState.Declined;
        default:
            return CallCardState.Ended;
        }
    }

    if (callProps.call_status === CallPostStatus.Calling && numUsers <= 1) {
        return CallCardState.Calling;
    }

    return CallCardState.Active;
}

interface Props {
    post: Post,
    isRHS: boolean,
}

export const PostTypeEvent = ({post, isRHS}: Props) => {
    const intl = useIntl();
    const {formatMessage} = intl;

    const currentUserID = useSelector(getCurrentUserId);
    const user = useSelector((state: GlobalState) => getUser(state, post.user_id));
    const channel = useSelector((state: GlobalState) => getChannel(state, post.channel_id));

    // Nothing on the post records who declined, but it can only have been the other side of the DM:
    // the post's author is the caller, and a DM has exactly two people in it.
    const calleeID = getUserIdFromDM(channel?.name || '', post.user_id);
    const callee = useSelector((state: GlobalState) => getUser(state, calleeID));

    const isAdmin = useSelector(isCurrentUserSystemAdmin);
    const connectedID = useSelector(channelIDForCurrentCall);
    const callID = useSelector((state: GlobalState) => idForCallInChannel(state, post.channel_id)) || '';
    const profiles = useSelector((state: GlobalState) => profilesInCallInChannel(state, post.channel_id), shallowEqual);

    // The card's ringing state is derived from how many people are in the call, which has to come
    // from the sessions rather than from profiles: profilesInCallInChannel drops anyone whose
    // profile hasn't been fetched yet, which would read as a call nobody has answered.
    const numUsers = useSelector((state: GlobalState) => numUsersInCallInChannel(state, post.channel_id));
    const isHost = useSelector((state: GlobalState) => hostIDForCallInChannel(state, post.channel_id)) === currentUserID;
    const isCloudPaid = useSelector(isCloudProfessionalOrEnterpriseorEnterpriseAdvanceOrTrial);
    const maxCallParticipants = useSelector(maxParticipants);
    const militaryTime = useSelector((state: GlobalState) => getBool(state, Preferences.CATEGORY_DISPLAY_SETTINGS, Preferences.USE_MILITARY_TIME, false));
    const compactDisplay = useSelector((state: GlobalState) => get(state, Preferences.CATEGORY_DISPLAY_SETTINGS, MESSAGE_DISPLAY, MESSAGE_DISPLAY_DEFAULT)) === MESSAGE_DISPLAY_COMPACT;

    const [, onJoin] = useDismissJoin(post.channel_id, callID);

    const hourCycle: 'h23' | 'h12' = militaryTime ? 'h23' : 'h12';
    const timeFormat = {...DateTime.TIME_24_SIMPLE, hourCycle};

    const callProps = getCallPropsFromPost(post);
    const cardState = getCallCardState(callProps, numUsers);
    const isCalling = cardState === CallCardState.Calling;

    // The call-start post is authored by whoever placed the call, which is what tells the caller's
    // card apart from the callee's. A DM only ever has those two viewers.
    const isCaller = post.user_id === currentUserID;

    // The callee's side of a ringing call: they're being invited, not placing the call.
    const isIncomingCall = isCalling && !isCaller;

    // A DM call is between the two people already named by the post itself, so the card doesn't
    // repeat them: no participant avatars and no "by {user}". That leaves little enough to show
    // that the card stays on one row at any width, as the design has it.
    const isDM = isDMChannel(channel);

    const timestampFn = useCallback(() => {
        return callStartedTimestampFn(intl, callProps.start_at);
    }, [intl, callProps.start_at]);

    const onLeaveButtonClick = () => {
        const callsClient = getCallsClient();
        if (callsClient) {
            // NOTE: this also handles the desktop global widget case since the opener window
            // will have the client.
            callsClient.disconnect();
        } else if (window.desktopAPI?.leaveCall) {
            window.desktopAPI.leaveCall();
        }
    };

    const recordings = Object.values(callProps.recordings).filter((job) => Boolean(job.file_id)).map((job) => job.file_id);
    const transcriptions = Object.values(callProps.transcriptions).filter((job) => Boolean(job.file_id)).map((job) => job.file_id);

    const recordingsSubMessage = recordings.length > 0 ? (
        <ArtifactsContainer>
            <CompassIcon
                icon='file-video-outline'
                style={{display: 'inline', fontSize: '16px'}}
            />
            <span>{formatMessage({defaultMessage: '{count, plural, =1 {# recording} other {# recordings}}'}, {count: recordings.length})}</span>
        </ArtifactsContainer>
    ) : null;

    const transcriptionsSubMessage = recordings.length > 0 ? (
        <ArtifactsContainer>
            <CompassIcon
                icon='file-text-outline'
                style={{display: 'inline', fontSize: '16px'}}
            />
            <span>{formatMessage({defaultMessage: '{count, plural, =1 {# transcription} other {# transcriptions}}'}, {count: transcriptions.length})}</span>
        </ArtifactsContainer>
    ) : null;

    const durationSubMessage = (
        <>
            <span>
                {formatMessage(
                    {defaultMessage: 'Ended at {endTime}'},
                    {endTime: DateTime.fromMillis(callProps.end_at).toLocaleString(timeFormat)},
                )}
            </span>
            <Divider>{untranslatable('•')}</Divider>
            <span>
                {formatMessage(
                    {defaultMessage: 'Lasted {callDuration}'},
                    {callDuration: toHuman(intl, LuxonDuration.fromMillis(callProps.end_at - callProps.start_at), 'minutes', {unitDisplay: 'long'})},
                )}
            </span>
        </>
    );

    const startedSubMessage = (
        <>
            <Timestamp
                timestampFn={timestampFn}
                interval={5000}
            />
            {!isDM && untranslatable(' ')}
            {!isDM &&
                formatMessage({defaultMessage: 'by {user}'}, {user: getUserDisplayName(user)})
            }
        </>
    );

    let subMessage: JSX.Element | null = null;
    switch (cardState) {
    case CallCardState.Calling:
        break;
    case CallCardState.Active:
        subMessage = startedSubMessage;
        break;
    case CallCardState.NoAnswer:
        subMessage = <span>{isCaller ? formatMessage({defaultMessage: 'No answer'}) : formatMessage({defaultMessage: 'Missed call'})}</span>;
        break;
    case CallCardState.Canceled:
        subMessage = (
            <span>
                {isCaller && formatMessage({defaultMessage: 'You canceled the call'})}
                {!isCaller && (user ? formatMessage({defaultMessage: 'Canceled by {user}'}, {user: getUserDisplayName(user)}) : formatMessage({defaultMessage: 'Canceled'}))}
            </span>
        );
        break;
    case CallCardState.Declined:
        subMessage = (
            <span>
                {!isCaller && formatMessage({defaultMessage: 'You declined the call'})}
                {isCaller && (callee ? formatMessage({defaultMessage: 'Declined by {user}'}, {user: getUserDisplayName(callee)}) : formatMessage({defaultMessage: 'Declined'}))}
            </span>
        );
        break;
    default:
        // An ended call with no start_at can't have a duration to report, so fall back to
        // saying nothing rather than showing a bogus one.
        subMessage = callProps.start_at > 0 ? durationSubMessage : null;
    }

    // A call that's ringing you is an invitation to pick up rather than a call in progress to
    // join, which is short enough to say in one word.
    const joinLabel = isIncomingCall ? formatMessage({defaultMessage: 'Join'}) : formatMessage({defaultMessage: 'Join call'});

    let joinButton = (
        <JoinButton onClick={onJoin}>
            <ActiveCallIcon
                fill='var(--center-channel-bg)'
                style={{width: '16px', height: '16px'}}
            />
            <ButtonText>{joinLabel}</ButtonText>
        </JoinButton>
    );

    // Note: don't use isLimitRestricted because that uses current channel, and this post could be in RHS
    if (maxCallParticipants > 0 && profiles.length >= maxCallParticipants) {
        joinButton = (
            <OverlayTrigger
                placement='top'
                overlay={
                    <Tooltip id='tooltip-limit'>
                        <Header>
                            {formatMessage({defaultMessage: 'Sorry, participants per call are currently limited to {count}.'}, {count: maxCallParticipants})}
                        </Header>
                        {isCloudPaid &&
                            <SubHeader>
                                {formatMessage({defaultMessage: 'This is because calls is in the beta phase. We’re working to remove this limit soon.'})}
                            </SubHeader>
                        }
                    </Tooltip>
                }
            >
                <DisabledButton>
                    <CallIcon fill='rgba(var(--center-channel-color-rgb), 0.32)'/>
                    <ButtonText>{joinLabel}</ButtonText>
                </DisabledButton>
            </OverlayTrigger>
        );
    }

    const compactTitle = compactDisplay && !isRHS ? <br/> : <></>;
    const title = callProps.title ? <h3 className='markdown__heading'>{callProps.title}</h3> : compactTitle;
    const callActive = callProps.end_at === 0;
    const inCall = connectedID === post.channel_id;

    // Hanging up on a call nobody answered yet cancels it rather than leaving it, which is also
    // how the server records it (callEndReasonCanceledByCaller).
    const iconAndText = (
        <>
            <LeaveCallIcon style={{fill: 'var(--button-color)', width: '18px', height: '16px'}}/>
            <ButtonText>
                {isCalling ? formatMessage({defaultMessage: 'Cancel'}) : formatMessage({defaultMessage: 'Leave'})}
            </ButtonText>
        </>
    );
    const showLeaveMenu = !isCalling && !isDMChannel(channel) && (isHost || isAdmin) && profiles.length > 1;
    let leaveButton: JSX.Element;
    if (showLeaveMenu) {
        leaveButton = (
            <DotMenu
                icon={iconAndText}
                dotMenuButton={LeaveButton}
                placement={'top'}
                portal={true}
            >
                <LeaveCallMenu
                    channelID={post.channel_id}
                    isHost={isHost}
                    numParticipants={profiles.length}
                    leaveCall={onLeaveButtonClick}
                />
            </DotMenu>
        );
    } else {
        leaveButton = (
            <LeaveButton
                $isActive={false}
                onClick={onLeaveButtonClick}
                role='button'
                aria-label={isCalling ? formatMessage({defaultMessage: 'Cancel call'}) : formatMessage({defaultMessage: 'Leave call'})}
            >
                {iconAndText}
            </LeaveButton>
        );
    }
    const button = inCall ? leaveButton : joinButton;

    return (
        <>
            {title}
            <Main data-testid={'call-thread'}>
                <SubMain $stayInline={isCalling || isDM}>
                    <Left>
                        <CallIndicator $ended={!callActive}>
                            {callActive &&
                                <ActiveCallIcon
                                    fill='var(--center-channel-bg)'
                                    style={{width: '20px', height: '20px'}}
                                />
                            }
                            {!callActive &&
                                <LeaveCallIcon
                                    fill={'rgba(var(--center-channel-color-rgb), 0.72)'}
                                    style={{width: '24px', height: '20px'}}
                                />
                            }
                        </CallIndicator>
                        <MessageWrapper>
                            <Message>
                                {isCalling &&
                                    (isIncomingCall ? formatMessage({defaultMessage: 'Incoming call…'}) : formatMessage({defaultMessage: 'Calling…'}))
                                }
                                {callActive && !isCalling &&
                                    formatMessage({defaultMessage: 'Call started'})
                                }
                                {!callActive &&
                                    formatMessage({defaultMessage: 'Call ended'})
                                }
                            </Message>
                            {subMessage && <SubMessage>{subMessage}</SubMessage>}
                        </MessageWrapper>
                    </Left>
                    { !isCalling && !isDM && (recordings.length > 0 || callActive) && <RowDivider/> }
                    <Right $stayInline={isCalling || isDM}>
                        {callActive &&
                            <>
                                {!isCalling && !isDM &&
                                    <Profiles>
                                        <ConnectedProfiles
                                            profiles={profiles}
                                            size={28}
                                            fontSize={14}
                                            border={true}
                                            maxShowedProfiles={3}
                                        />
                                    </Profiles>
                                }
                                {button}
                            </>
                        }
                        {recordings.length > 0 && recordingsSubMessage}
                        {transcriptions.length > 0 && transcriptionsSubMessage}
                    </Right>
                </SubMain>
            </Main>
        </>
    );
};

const Main = styled.div`
    display: flex;
    align-items: center;
    width: min(600px, 100%);
    margin: 4px 0;
    padding: 16px;
    background: var(--center-channel-bg);
    border: 1px solid rgba(var(--center-channel-color-rgb), 0.12);
    box-shadow: var(--elevation-1);
    color: var(--center-channel-color);
    border-radius: 4px;

    container: main / inline-size;

    &:hover {
        border: 1px solid rgba(var(--center-channel-color-rgb), 0.16);
    }
`;

// $stayInline keeps the card on a single row however narrow it gets. The stacked layout below
// exists to give a participant list and a "Call started … by Someone" message room to breathe; a
// ringing call has neither, so stacking it just pushes its one button onto a row of its own.
const SubMain = styled.div<{ $stayInline: boolean }>`
    display: flex;
    align-items: center;
    width: 100%;
    flex-wrap: wrap;
    row-gap: 12px;

    container-type: inline-size;

    ${({$stayInline}) => !$stayInline && css`
        @container main (inline-size < 566px) {
            flex-direction: column;
            align-items: flex-start;
        }
    `}

    &:empty {
      display: none;
    }
`;

const Left = styled.div`
    display: flex;
    flex-grow: 10;
    overflow: hidden;
    white-space: nowrap;
    align-items: center;
`;

const Right = styled.div<{ $stayInline: boolean }>`
    display: flex;
    flex-grow: 1;
    justify-content: flex-end;
    gap: 12px;

    ${({$stayInline}) => ($stayInline ? css`
        /* Left is the one that gives, ellipsing its message, so the button keeps its size. */
        flex-shrink: 0;
    ` : css`
        @container main (inline-size < 566px) {
          width: 100%;
          justify-content: space-between;
          flex-wrap: wrap;
        }
    `)}

    &:empty {
      display: none;
    }
`;

const RowDivider = styled.hr`
    display: none;

    @container main (inline-size < 566px) {
        &&&& {
          display: block;
          width: 100%;
          margin: 0;
          border-top: 1px solid rgba(var(--center-channel-color-rgb), 0.08);
        }
    }
`;

const CallIndicator = styled.div<{ $ended: boolean }>`
    display: flex;
    justify-content: center;
    align-items: center;
    background: ${(props) => (props.$ended ? 'rgba(var(--center-channel-color-rgb), 0.08)' : 'var(--online-indicator)')};
    border-radius: 24px;
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    gap: 8px;
`;

const MessageWrapper = styled.div`
    display: flex;
    flex-direction: column;
    margin: 0 12px;
    overflow: hidden;
`;

const Message = styled.span`
    font-weight: 600;
    font-family: Metropolis;
    font-size: 16px;
    line-height: 24px;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--center-channel-color);
`;

const SubMessage = styled.div`
    white-space: normal;
    font-size: 12px;
    line-height: 16px;
    color: rgba(var(--center-channel-color-rgb), 0.72);
`;

const Profiles = styled.div`
    display: flex;
    align-items: center;
`;

const Button = styled.button`
    display: flex;
    align-items: center;
    border: none;
    border-radius: 4px;
    padding: 10px 16px;
    cursor: pointer;
`;

const JoinButton = styled(Button)`
    font-size: 14px;
    line-height: 20px;
    color: var(--center-channel-bg);
    background: var(--online-indicator);

    &:hover {
        background: linear-gradient(0deg, var(--online-indicator), var(--online-indicator)),
            linear-gradient(0deg, rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.08));
        background-blend-mode: multiply;
    }

    &:active {
        background: linear-gradient(0deg, var(--online-indicator), var(--online-indicator)),
            linear-gradient(0deg, rgba(0, 0, 0, 0.16), rgba(0, 0, 0, 0.16));
        background-blend-mode: multiply;
    }
`;

const LeaveButton = styled(DotMenuButton)`
    display: flex;
    border: none;
    border-radius: 4px;
    padding: 10px 16px;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    width: unset;
    height: unset;
    font-size: 14px;
    line-height: 20px;
    color: var(--button-color);
    background: var(--error-text);

    &:hover {
        background: linear-gradient(0deg, var(--error-text), var(--error-text)),
            linear-gradient(0deg, rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.08));
        background-blend-mode: multiply;
        color: var(--button-color);
    }

    &:active {
        background: linear-gradient(0deg, var(--error-text), var(--error-text)),
            linear-gradient(0deg, rgba(0, 0, 0, 0.16), rgba(0, 0, 0, 0.16));
        background-blend-mode: multiply;
        color: var(--button-color);
    }
`;

const ButtonText = styled.span`
    font-weight: 600;
    margin: 0 8px;
`;

const DisabledButton = styled(Button)`
    color: rgba(var(--center-channel-color-rgb), 0.32);
    background: rgba(var(--center-channel-color-rgb), 0.08);
    cursor: not-allowed;
`;

const Divider = styled.span`
    margin: 0 4px;
`;

const ArtifactsContainer = styled.div`
    display: flex;
    align-items: center;
    font-size: 12px;
    line-height: 16px;
    white-space: nowrap;
    color: rgba(var(--center-channel-color-rgb), 0.72);
`;

