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
    isCloudLimitRestricted: boolean,
    cloudMaxParticipants: number,
}

const ChannelHeaderDropdownButton = ({
    show,
    inCall,
    hasCall,
    isCloudFeatureRestricted,
    isCloudLimitRestricted,
    cloudMaxParticipants,
}: Props) => {
    if (!show) {
        return null;
    }
    const restricted = isCloudFeatureRestricted || isCloudLimitRestricted;
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

    if (isCloudFeatureRestricted) {
        return (
            <OverlayTrigger
                placement='bottom'
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

    if (isCloudLimitRestricted && !inCall) {
        return (
            <OverlayTrigger
                placement='bottom'
                overlay={
                    <Tooltip id='tooltip-limit-header'>
                        <Header>
                            {`There's a limit of ${cloudMaxParticipants} participants per call.`}
                        </Header>
                        <SubHeader>
                            {'This is because calls is currently in beta. We’re working to remove this limit soon.'}
                        </SubHeader>
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
