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
}

const ChannelHeaderButton = ({
    show,
    inCall,
    hasCall,
    isCloudFeatureRestricted,
    isCloudPaid,
    isLimitRestricted,
    maxParticipants,
}: Props) => {
    if (!show) {
        return null;
    }

    const restricted = isLimitRestricted || isCloudFeatureRestricted;

    const button = (
        <CallButton
            id='calls-join-button'
            className={'style--none call-button ' + (inCall || restricted ? 'disabled' : '')}
            restricted={restricted}
            isCloudPaid={isCloudPaid}
        >
            <CompassIcon icon='phone-outline'/>
            <span className='call-button-label'>
                {hasCall ? 'Join call' : 'Start call'}
            </span>
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
                <Wrapper>
                    {button}
                    <UpsellIcon className={'icon icon-key-variant-circle'}/>
                </Wrapper>
            </OverlayTrigger>
        );
    }

    if (isLimitRestricted && !inCall) {
        return (
            <OverlayTrigger
                placement='bottom'
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
