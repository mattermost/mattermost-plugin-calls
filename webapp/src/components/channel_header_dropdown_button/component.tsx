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

const ChannelHeaderDropdownButton = ({
    show,
    inCall,
    hasCall,
    isAdmin,
    isCloudStarter,
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
            className={'style--none call-button-dropdown ' + (inCall || restricted ? 'disabled' : '')}
            $restricted={restricted}
        >
            <CompassIcon icon='phone'/>
            <div>
                <span className='call-button-label'>
                    {hasCall ? formatMessage({defaultMessage: 'Join call'}) : formatMessage({defaultMessage: 'Start call'})}
                </span>
                <span className='call-button-dropdown-sublabel'>
                    {formatMessage({defaultMessage: 'In this channel'})}
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
                {button}
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

    if (isLimitRestricted && !inCall) {
        return (
            <OverlayTrigger
                placement='bottom'
                rootClose={true}
                overlay={
                    <Tooltip id='tooltip-limit-header'>
                        <Header>
                            {formatMessage({defaultMessage: 'There\'s a limit of {count, plural, =1 {# participant} other {# participants}} per call.'}, {count: maxParticipants})}
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
                    </Tooltip>
                }
            >
                {button}
            </OverlayTrigger>
        );
    }

    return button;
};

const CallButton = styled.button<{$restricted: boolean}>`
    // &&&&& is to override the call-button styles
    &&&&& {
        ${(props) => props.$restricted && css`
            .call-button-label {
                color: rgba(var(--center-channel-color-rgb), 0.72);
            }
            .call-button-dropdown-sublabel {
                color: rgba(var(--center-channel-color-rgb), 0.56);
            }
            >i {
                color: rgba(var(--center-channel-color-rgb), 0.56);
            }
        `}
    }
`;

const UpsellIcon = styled.i`
    // &&&&&& is to override the call-button styles
    &&&&&& {
      position: absolute;
      right: 10px;
      top: 16px;
      color: var(--button-bg);
      width: 16px;
      height: 16px;
      border-radius: 50%;
    }
`;

export default ChannelHeaderDropdownButton;
