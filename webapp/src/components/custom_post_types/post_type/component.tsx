import React from 'react';
import {useSelector} from 'react-redux';
import {useIntl} from 'react-intl';
import moment from 'moment-timezone';
import styled from 'styled-components';

import {GlobalState} from '@mattermost/types/store';
import {UserProfile} from '@mattermost/types/users';
import {Post} from '@mattermost/types/posts';

import {OverlayTrigger, Tooltip} from 'react-bootstrap';

import {getUser} from 'mattermost-redux/selectors/entities/users';

import CompassIcon from 'src/components/icons/compassIcon';
import ActiveCallIcon from 'src/components/icons/active_call_icon';
import CallIcon from 'src/components/icons/call_icon';
import LeaveCallIcon from 'src/components/icons/leave_call_icon';
import ConnectedProfiles from 'src/components/connected_profiles';
import {Header, SubHeader} from 'src/components/shared';

import {
    shouldRenderDesktopWidget,
    sendDesktopEvent,
    untranslatable,
    getUserDisplayName,
} from 'src/utils';

interface Props {
    post: Post,
    connectedID: string,
    pictures: string[],
    profiles: UserProfile[],
    showSwitchCallModal: (targetID: string) => void,
    isCloudPaid: boolean,
    maxParticipants: number,
}

const PostType = ({
    post,
    connectedID,
    pictures,
    profiles,
    showSwitchCallModal,
    isCloudPaid,
    maxParticipants,
}: Props) => {
    const {formatMessage} = useIntl();

    const user = useSelector((state: GlobalState) => getUser(state, post.user_id));

    const onJoinCallClick = () => {
        if (connectedID) {
            showSwitchCallModal(post.channel_id);
            return;
        }
        window.postMessage({type: 'connectCall', channelID: post.channel_id}, window.origin);
    };

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
                {formatMessage({defaultMessage: 'Ended at {endTime}'}, {endTime: moment(post.props.end_at).format('h:mm A')})}
            </Duration>
            <Divider>{untranslatable('•')}</Divider>
            <Duration>
                {formatMessage({defaultMessage: 'Lasted {callDuration}'}, {callDuration: moment.duration(post.props.end_at - post.props.start_at).humanize(false)})}
            </Duration>
            { recordingsSubMessage }
        </>
    ) : (
        <Duration>{moment(post.props.start_at).fromNow()}</Duration>
    );

    let joinButton = (
        <JoinButton onClick={onJoinCallClick}>
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
                        { isCloudPaid &&
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
                                { !post.props.end_at &&
                                    formatMessage({defaultMessage: '{user} started a call'}, {user: getUserDisplayName(user)})
                                }
                                { post.props.end_at &&
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
                                        pictures={pictures}
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
