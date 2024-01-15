import {Post} from '@mattermost/types/posts';
import {GlobalState} from '@mattermost/types/store';
import {UserProfile} from '@mattermost/types/users';
import {DateTime, Duration as LuxonDuration} from 'luxon';
import {getUser} from 'mattermost-redux/selectors/entities/users';
import React, {useCallback} from 'react';
import {OverlayTrigger, Tooltip} from 'react-bootstrap';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import ConnectedProfiles from 'src/components/connected_profiles';
import ActiveCallIcon from 'src/components/icons/active_call_icon';
import CallIcon from 'src/components/icons/call_icon';
import CompassIcon from 'src/components/icons/compassIcon';
import LeaveCallIcon from 'src/components/icons/leave_call_icon';
import {useDismissJoin} from 'src/components/incoming_calls/hooks';
import {Header, SubHeader} from 'src/components/shared';
import Timestamp from 'src/components/timestamp';
import {idForCallInChannel} from 'src/selectors';
import {
    callStartedTimestampFn,
    getCallPropsFromPost,
    getUserDisplayName,
    sendDesktopEvent,
    shouldRenderDesktopWidget,
    toHuman,
    untranslatable,
} from 'src/utils';
import styled from 'styled-components';

interface Props {
    post: Post,
    connectedID: string,
    profiles: UserProfile[],
    isCloudPaid: boolean,
    maxParticipants: number,
    militaryTime: boolean,
    compactDisplay: boolean,
    isRHS: boolean,
}

const PostType = ({
    post,
    connectedID,
    profiles,
    isCloudPaid,
    maxParticipants,
    militaryTime,
    compactDisplay,
    isRHS,
}: Props) => {
    const intl = useIntl();
    const {formatMessage} = intl;
    const hourCycle: 'h23' | 'h12' = militaryTime ? 'h23' : 'h12';
    const timeFormat = {...DateTime.TIME_24_SIMPLE, hourCycle};

    const callProps = getCallPropsFromPost(post);

    const user = useSelector((state: GlobalState) => getUser(state, post.user_id));
    const callID = useSelector((state: GlobalState) => idForCallInChannel(state, post.channel_id)) || '';
    const [, onJoin] = useDismissJoin(post.channel_id, callID);

    const timestampFn = useCallback(() => {
        return callStartedTimestampFn(intl, callProps.start_at);
    }, [intl, callProps.start_at]);

    const onLeaveButtonClick = () => {
        const win = window.opener || window;
        const callsClient = win.callsClient;
        if (callsClient) {
            // NOTE: this also handles the desktop global widget case since the opener window
            // will have the client.
            callsClient.disconnect();
        } else if (shouldRenderDesktopWidget()) {
            // DEPRECATED: legacy Desktop API logic (<= 5.6.0)
            sendDesktopEvent('calls-leave-call', {callID: post.channel_id});
        }
    };

    const recordings = callProps.recording_files?.length || 0;

    const recordingsSubMessage = recordings > 0 ? (
        <>
            <Divider>{untranslatable('•')}</Divider>
            <CompassIcon
                icon='file-video-outline'
                style={{display: 'inline'}}
            />
            <span>{formatMessage({defaultMessage: '{count, plural, =1 {# recording} other {# recordings}} available'}, {count: recordings})}</span>
        </>
    ) : null;

    const subMessage = callProps.start_at && callProps.end_at ? (
        <>
            <Duration>
                {formatMessage(
                    {defaultMessage: 'Ended at {endTime}'},
                    {endTime: DateTime.fromMillis(callProps.end_at).toLocaleString(timeFormat)},
                )}
            </Duration>
            <Divider>{untranslatable('•')}</Divider>
            <Duration>
                {formatMessage(
                    {defaultMessage: 'Lasted {callDuration}'},
                    {callDuration: toHuman(intl, LuxonDuration.fromMillis(callProps.end_at - callProps.start_at), 'minutes', {unitDisplay: 'long'})},
                )}
            </Duration>
            {recordingsSubMessage}
        </>
    ) : (
        <Duration>
            <Timestamp
                timestampFn={timestampFn}
                interval={5000}
            />
        </Duration>
    );

    let joinButton = (
        <JoinButton onClick={onJoin}>
            <CallIcon fill='var(--center-channel-bg)'/>
            <ButtonText>{formatMessage({defaultMessage: 'Join call'})}</ButtonText>
        </JoinButton>
    );

    // Note: don't use isLimitRestricted because that uses current channel, and this post could be in RHS
    if (maxParticipants > 0 && profiles.length >= maxParticipants) {
        joinButton = (
            <OverlayTrigger
                placement='top'
                overlay={
                    <Tooltip id='tooltip-limit'>
                        <Header>
                            {formatMessage({defaultMessage: 'Sorry, participants per call are currently limited to {count}.'}, {count: maxParticipants})}
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
                    <ButtonText>{formatMessage({defaultMessage: 'Join call'})}</ButtonText>
                </DisabledButton>
            </OverlayTrigger>
        );
    }

    const compactTitle = compactDisplay && !isRHS ? <br/> : <></>;
    const title = callProps.title ? <h3 className='markdown__heading'>{callProps.title}</h3> : compactTitle;
    const callActive = !callProps.end_at;
    const inCall = connectedID === post.channel_id;
    const button = inCall ? (
        <LeaveButton onClick={onLeaveButtonClick}>
            <LeaveCallIcon
                fill='var(--error-text)'
                style={{width: '14px', height: '14px'}}
            />
            <ButtonText>{formatMessage({defaultMessage: 'Leave call'})}</ButtonText>
        </LeaveButton>
    ) : joinButton;

    return (
        <>
            {title}
            <Main data-testid={'call-thread'}>
                <SubMain ended={Boolean(callProps.end_at)}>
                    <Left>
                        <CallIndicator ended={Boolean(callProps.end_at)}>
                            {!callProps.end_at &&
                                <ActiveCallIcon
                                    fill='var(--center-channel-bg)'
                                    style={{width: '100%', height: '100%'}}
                                />
                            }
                            {callProps.end_at &&
                                <LeaveCallIcon
                                    fill={'rgba(var(--center-channel-color-rgb), 0.56)'}
                                    style={{width: '100%', height: '100%'}}
                                />
                            }
                        </CallIndicator>
                        <MessageWrapper>
                            <Message>
                                {!callProps.end_at &&
                                    formatMessage({defaultMessage: '{user} started a call'}, {user: getUserDisplayName(user)})
                                }
                                {callProps.end_at &&
                                    formatMessage({defaultMessage: 'Call ended'})
                                }
                            </Message>
                            <SubMessage>{subMessage}</SubMessage>
                        </MessageWrapper>
                    </Left>
                    <Right>
                        {callActive &&
                            <>
                                <Profiles>
                                    <ConnectedProfiles
                                        profiles={profiles}
                                        size={32}
                                        fontSize={12}
                                        border={true}
                                        maxShowedProfiles={2}
                                    />
                                </Profiles>
                                {button}
                            </>
                        }
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
    border: 1px solid rgba(var(--center-channel-color-rgb), 0.16);
    box-shadow: 0px 4px 6px rgba(var(--center-channel-color-rgb), 0.12);
    color: var(--center-channel-color);
    border-radius: 4px;
`;

const SubMain = styled.div<{ ended: boolean }>`
    display: flex;
    align-items: center;
    width: 100%;
    flex-wrap: ${(props) => (props.ended ? 'nowrap' : 'wrap')};
    row-gap: 8px;
`;

const Left = styled.div`
    display: flex;
    flex-grow: 10;
    overflow: hidden;
    white-space: nowrap;
    align-items: center;
`;

const Right = styled.div`
    display: flex;
    flex-grow: 1;
`;

const CallIndicator = styled.div<{ ended: boolean }>`
    background: ${(props) => (props.ended ? 'rgba(var(--center-channel-color-rgb), 0.16)' : 'var(--online-indicator)')};
    border-radius: 4px;
    padding: 10px;
    width: 40px;
    height: 40px;
    flex-shrink: 0;
`;

const MessageWrapper = styled.div`
    display: flex;
    flex-direction: column;
    margin: 0 12px;
    overflow: hidden;
`;

const Message = styled.span`
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const SubMessage = styled.div`
    white-space: normal;
`;

const Profiles = styled.div`
    display: flex;
    align-items: center;
    margin-right: auto;
`;

const Duration = styled.span`
    color: var(--center-channel-color);
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
    color: var(--center-channel-bg);
    background: var(--online-indicator);
`;

const LeaveButton = styled(Button)`
    color: var(--error-text);
    background: rgba(var(--error-text-color-rgb), 0.16);
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

export default PostType;
