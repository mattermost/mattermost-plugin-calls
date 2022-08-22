import React from 'react';

import {OverlayTrigger, Tooltip} from 'react-bootstrap';

import styled, {css} from 'styled-components';

import CompassIcon from 'src/components/icons/compassIcon';
import {Header, SubHeader} from 'src/components/shared';

interface Props {
    show: boolean,
    inCall: boolean,
    hasCall: boolean,
    isCloudFeatureRestricted: boolean,
    isCloudPaid: boolean,
    isLimitRestricted: boolean,
    maxParticipants: number,
    isChannelArchived: boolean,
}

const ChannelHeaderDropdownButton = ({
    show,
    inCall,
    hasCall,
    isCloudFeatureRestricted,
    isCloudPaid,
    isLimitRestricted,
    maxParticipants,
    isChannelArchived,
}: Props) => {
    if (!show) {
        return null;
    }
    const restricted = isLimitRestricted || isCloudFeatureRestricted || isChannelArchived;
    const isCloudLimitRestricted = isCloudPaid && isLimitRestricted;
    const withUpsellIcon = isCloudFeatureRestricted || (isCloudLimitRestricted && !inCall);

    const button = (
        <CallButton
            id='calls-join-button'
            className={'style--none call-button-dropdown ' + (inCall || restricted ? 'disabled' : '')}
            restricted={restricted}
        >
            <CompassIcon icon='phone-outline'/>
            <div>
                <span className='call-button-label'>
                    {hasCall ? 'Join Call' : 'Start Call'}
                </span>
                <span className='call-button-dropdown-sublabel'>
                    {'In this channel'}
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
                        {'Calls are not available in archived channels.'}
                    </Tooltip>
                }
            >
                {button}
            </OverlayTrigger>
        );
    }

    if (isCloudFeatureRestricted) {
        return (
            <OverlayTrigger
                placement='bottom'
                rootClose={true}
                overlay={
                    <Tooltip id='tooltip-limit-header'>
                        <Header>
                            {'Mattermost Professional feature'}
                        </Header>
                        <SubHeader>
                            {'This is a paid feature, available with a free 30-day trial'}
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
                            {`There's a limit of ${maxParticipants} participants per call.`}
                        </Header>

                        {isCloudPaid &&
                        <SubHeader>
                            {'This is because calls is currently in beta. We’re working to remove this limit soon.'}
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

const CallButton = styled.button<{restricted: boolean}>`
    // &&&&& is to override the call-button styles
    &&&&& {
        ${(props) => props.restricted && css`
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
