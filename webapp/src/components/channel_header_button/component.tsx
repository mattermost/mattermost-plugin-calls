import React from 'react';
import {OverlayTrigger, Tooltip} from 'react-bootstrap';
import {useIntl} from 'react-intl';
import CompassIcon from 'src/components/icons/compassIcon';
import {Header, SubHeader} from 'src/components/shared';
import styled, {css} from 'styled-components';

interface Props {
    show: boolean,
    inCall: boolean,
    hasCall: boolean,
    isAdmin: boolean,
    isCloudStarter: boolean,
    isCloudPaid: boolean,
    isLimitRestricted: boolean,
    maxParticipants: number,
    isChannelArchived: boolean,
}

const ChannelHeaderButton = ({
    show,
    inCall,
    hasCall,
    isAdmin,
    isCloudStarter,
    isCloudPaid,
    isLimitRestricted,
    maxParticipants,
    isChannelArchived,
}: Props) => {
    const {formatMessage} = useIntl();

    if (!show) {
        return null;
    }

    const restricted = isLimitRestricted || isChannelArchived;
    const withUpsellIcon = (isLimitRestricted && isCloudStarter && !inCall);

    const button = (
        <CallButton
            id='calls-join-button'
            className={'style--none call-button ' + (inCall || restricted ? 'disabled' : '')}
            restricted={restricted}
            isCloudPaid={isCloudPaid}
        >
            <CompassIcon icon='phone-outline'/>
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
    if (isLimitRestricted && !inCall) {
        return (
            <OverlayTrigger
                placement='bottom'
                rootClose={true}
                overlay={
                    <Tooltip id='tooltip-limit-header'>
                        <Header>
                            {formatMessage({defaultMessage: 'This call is at its maximum capacity of {count, plural, =1 {# participant} other {# participants}}.'}, {count: maxParticipants})}
                        </Header>

                        {isCloudStarter && !isAdmin &&
                            <SubHeader>
                                {formatMessage({defaultMessage: 'Contact your system admin for more information about call capacity.'})}
                            </SubHeader>
                        }
                        {isCloudStarter && isAdmin &&
                            <SubHeader>
                                {formatMessage({defaultMessage: 'Upgrade to Cloud Professional or Cloud Enterprise to enable group calls with more than {count, plural, =1 {# participant} other {# participants}}.'}, {count: maxParticipants})}
                            </SubHeader>
                        }
                        {isCloudPaid &&
                            <SubHeader>
                                {formatMessage({defaultMessage: 'At the moment, {count} is the participant limit for cloud calls.'}, {count: maxParticipants})}
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

const CallButton = styled.button<{ restricted: boolean, isCloudPaid: boolean }>`
    // &&& is to override the call-button styles
    &&& {
        ${(props) => props.restricted && css`
            color: rgba(var(--center-channel-color-rgb), 0.48);
            border: 1px solid rgba(var(--center-channel-color-rgb), 0.16);
            margin-right: 4px;
        `}
        cursor: ${(props) => (props.restricted && props.isCloudPaid ? 'not-allowed' : 'pointer')};
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
