import {DateTime, Duration as LuxonDuration} from 'luxon';
import React, {useCallback} from 'react';
import {OverlayTrigger, Tooltip} from 'react-bootstrap';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import styled from 'styled-components';

import {Post} from '@mattermost/types/posts';
import {GlobalState} from '@mattermost/types/store';
import {UserProfile} from '@mattermost/types/users';
import {getUser} from 'mattermost-redux/selectors/entities/users';
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
    shouldRenderDesktopWidget,
    sendDesktopEvent,
    untranslatable,
    getUserDisplayName,
    toHuman, callStartedTimestampFn,
} from 'src/utils';

interface Props {
    post: Post,
    connectedID: string,
    profiles: UserProfile[],
    isCloudPaid: boolean,
    maxParticipants: number,
    militaryTime: boolean,
}

const PostType = ({
    post,
    connectedID,
    profiles,
    isCloudPaid,
    maxParticipants,
    militaryTime,
}: Props) => {
    const intl = useIntl();
    const {formatMessage} = intl;
    const hourCycle: 'h23' | 'h12' = militaryTime ? 'h23' : 'h12';
    const timeFormat = {...DateTime.TIME_24_SIMPLE, hourCycle};

    const user = useSelector((state: GlobalState) => getUser(state, post.user_id));
    const callID = useSelector((state: GlobalState) => idForCallInChannel(state, post.channel_id)) || '';
    const [, onJoin] = useDismissJoin(post.channel_id, callID);

    const timestampFn = useCallback(() => {
        return callStartedTimestampFn(intl, post.props.start_at);
    }, [intl, post.props.start_at]);

    const onLeaveButtonClick = () => {
        if (window.callsClient) {
            window.callsClient.disconnect();
        } else if (shouldRenderDesktopWidget()) {
            sendDesktopEvent('calls-leave-call', {callID: post.channel_id});
        }
    };

    const recordings = post.props.recording_files?.length || 0;

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

    const subMessage = post.props.end_at ? (
        <>
            <Duration>
                {formatMessage(
                    {defaultMessage: 'Ended at {endTime}'},
                    {endTime: DateTime.fromMillis(post.props.end_at).toLocaleString(timeFormat)},
                )}
            </Duration>
            <Divider>{untranslatable('•')}</Divider>
            <Duration>
                {formatMessage(
                    {defaultMessage: 'Lasted {callDuration}'},
                    {callDuration: toHuman(intl, LuxonDuration.fromMillis(post.props.end_at - post.props.start_at), 'minutes', {unitDisplay: 'long'})},
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

    const callActive = !post.props.end_at;
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
            {post.props.title &&
                <h3 className='markdown__heading'>{post.props.title}</h3>
            }
            <Main data-testid={'call-thread'}>
                <SubMain ended={Boolean(post.props.end_at)}>
                    <Left>
                        <CallIndicator ended={Boolean(post.props.end_at)}>
                            {!post.props.end_at &&
                                <ActiveCallIcon
                                    fill='var(--center-channel-bg)'
                                    style={{width: '100%', height: '100%'}}
                                />
                            }
                            {post.props.end_at &&
                                <LeaveCallIcon
                                    fill={'rgba(var(--center-channel-color-rgb), 0.56)'}
                                    style={{width: '100%', height: '100%'}}
                                />
                            }
                        </CallIndicator>
                        <MessageWrapper>
                            <Message>
                                {!post.props.end_at &&
                                    formatMessage({defaultMessage: '{user} started a call'}, {user: getUserDisplayName(user)})
                                }
                                {post.props.end_at &&
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
