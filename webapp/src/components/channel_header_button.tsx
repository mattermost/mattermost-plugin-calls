import {GlobalState} from '@mattermost/types/store';
import {getCurrentChannel} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentUserId, getUser, isCurrentUserSystemAdmin} from 'mattermost-redux/selectors/entities/users';
import React from 'react';
import {OverlayTrigger, Tooltip} from 'react-bootstrap';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import CompassIcon from 'src/components/icons/compassIcon';
import {Header, SubHeader} from 'src/components/shared';
import {
    callsShowButton,
    channelIDForCurrentCall,
    isCloudProfessionalOrEnterpriseOrTrial,
    isCloudStarter,
    isLimitRestricted,
    maxParticipants,
    profilesInCallInCurrentChannel,
} from 'src/selectors';
import {getUserIdFromDM, isDMChannel} from 'src/utils';
import styled, {css} from 'styled-components';

const ChannelHeaderButton = () => {
    const channel = useSelector(getCurrentChannel);
    const currentUserID = useSelector(getCurrentUserId);
    const otherUserID = getUserIdFromDM(channel?.name, currentUserID);
    const otherUser = useSelector((state: GlobalState) => getUser(state, otherUserID));
    const isDeactivatedDM = isDMChannel(channel) && otherUser?.delete_at > 0;
    const show = useSelector((state: GlobalState) => callsShowButton(state, channel?.id));
    const inCall = useSelector(channelIDForCurrentCall) === channel?.id;
    const hasCall = useSelector(profilesInCallInCurrentChannel).length > 0;
    const isAdmin = useSelector(isCurrentUserSystemAdmin);
    const cloudStarter = useSelector(isCloudStarter);
    const isCloudPaid = useSelector(isCloudProfessionalOrEnterpriseOrTrial);
    const limitRestricted = useSelector(isLimitRestricted);
    const maxCallParticipants = useSelector(maxParticipants);
    const isChannelArchived = channel?.delete_at > 0;

    const {formatMessage} = useIntl();

    if (!show || !channel) {
        return null;
    }

    const restricted = limitRestricted || isChannelArchived || isDeactivatedDM;
    const withUpsellIcon = (limitRestricted && cloudStarter && !inCall);

    const button = (
        <CallButton
            id='calls-join-button'
            className={'style--none call-button ' + (inCall || restricted ? 'disabled' : '')}
            disabled={isChannelArchived || isDeactivatedDM}
            $restricted={restricted}
            $isCloudPaid={isCloudPaid}
        >
            <CompassIcon icon='phone'/>
            <div>
                <span className='call-button-label'>
                    {hasCall ? formatMessage({defaultMessage: 'Join call'}) : formatMessage({defaultMessage: 'Start call'})}
                </span>
            </div>
            {withUpsellIcon &&
                <UpsellIcon className={'icon icon-key-variant'}/>
            }
        </CallButton>
    );

    if (isChannelArchived) {
        return (
            <OverlayTrigger
                placement='bottom'
                rootClose={true}
                overlay={
                    <Tooltip id='tooltip-limit-header'>
                        {formatMessage({defaultMessage: 'Calls are not available in archived channels.'})}
                    </Tooltip>
                }
            >
                <Wrapper>
                    {button}
                </Wrapper>
            </OverlayTrigger>
        );
    }

    if (isDeactivatedDM) {
        return (
            <OverlayTrigger
                placement='bottom'
                rootClose={true}
                overlay={
                    <Tooltip id='tooltip-limit-header'>
                        {formatMessage({defaultMessage: 'Calls are not available in a DM with a deactivated user.'})}
                    </Tooltip>
                }
            >
                <Wrapper>
                    {button}
                </Wrapper>
            </OverlayTrigger>
        );
    }

    if (withUpsellIcon) {
        return (
            <OverlayTrigger
                placement='bottom'
                rootClose={true}
                overlay={
                    <Tooltip id='tooltip-limit-header'>
                        <Header>
                            {formatMessage({defaultMessage: 'Mattermost Cloud Professional feature'})}
                        </Header>
                        <SubHeader>
                            {formatMessage({defaultMessage: 'This is a paid feature, available with a free 30-day trial'})}
                        </SubHeader>
                    </Tooltip>
                }
            >
                {button}
            </OverlayTrigger>
        );
    }

    // TODO: verify isCloudPaid message (asked in channel)
    if (limitRestricted && !inCall) {
        return (
            <OverlayTrigger
                placement='bottom'
                rootClose={true}
                overlay={
                    <Tooltip id='tooltip-limit-header'>
                        <Header>
                            {formatMessage({defaultMessage: 'This call is at its maximum capacity of {count, plural, =1 {# participant} other {# participants}}.'}, {count: maxCallParticipants})}
                        </Header>

                        {cloudStarter && !isAdmin &&
                            <SubHeader>
                                {formatMessage({defaultMessage: 'Contact your system admin for more information about call capacity.'})}
                            </SubHeader>
                        }
                        {cloudStarter && isAdmin &&
                            <SubHeader>
                                {formatMessage({defaultMessage: 'Upgrade to Cloud Professional or Cloud Enterprise to enable group calls with more than {count, plural, =1 {# participant} other {# participants}}.'}, {count: maxCallParticipants})}
                            </SubHeader>
                        }
                        {isCloudPaid &&
                            <SubHeader>
                                {formatMessage({defaultMessage: 'At the moment, {count} is the participant limit for cloud calls.'}, {count: maxCallParticipants})}
                            </SubHeader>
                        }
                    </Tooltip>
                }
            >
                {button}
            </OverlayTrigger>
        );
    }

    return button;
};

const CallButton = styled.button<{ $restricted: boolean, $isCloudPaid: boolean }>`
    // &&& is to override the call-button styles
    &&& {
        ${(props) => props.$restricted && css`
            color: rgba(var(--center-channel-color-rgb), 0.48);
            border: 1px solid rgba(var(--center-channel-color-rgb), 0.16);
            margin-right: 4px;
        `}
        cursor: ${(props) => (props.$restricted && props.$isCloudPaid ? 'not-allowed' : 'pointer')};
    }
`;

const Wrapper = styled.span`
    margin-right: 4px;
`;

const UpsellIcon = styled.i`
    // &&&&& is to override the call-button styles
    &&&&& {
        position: absolute;
        right: 52px;
        top: 12px;
        color: var(--button-bg);
        width: 16px;
        height: 16px;
        background-color: var(--center-channel-bg);
        border-radius: 50%;
    }
`;

export default ChannelHeaderButton;
