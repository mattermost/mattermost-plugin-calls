import React from 'react';

import {OverlayTrigger, Tooltip} from 'react-bootstrap';

import CompassIcon from 'src/components/icons/compassIcon';
import {CallButton, UpsellIcon} from 'src/components/shared';

interface Props {
    show: boolean,
    inCall: boolean,
    hasCall: boolean,
    isCloudFeatureRestricted: boolean,
    isCloudLimitRestricted: boolean,
}

const ChannelHeaderButton = ({
    show,
    inCall,
    hasCall,
    isCloudFeatureRestricted,
    isCloudLimitRestricted,
}: Props) => {
    if (!show) {
        return null;
    }
    const restricted = isCloudFeatureRestricted || isCloudLimitRestricted;

    const button = (
        <CallButton
            id='calls-join-button'
            className={'style--none call-button ' + (inCall || restricted ? 'disabled' : '')}
            restricted={restricted}
        >
            <CompassIcon icon='phone-outline'/>
            <span className='call-button-label'>
                {hasCall ? 'Join Call' : 'Start Call'}
            </span>
        </CallButton>
    );

    if (isCloudFeatureRestricted) {
        return (
            <OverlayTrigger
                placement='bottom'
                overlay={
                    <Tooltip id='tooltip-limit-header'>
                        {'Professional feature'}
                        <p>{'This is a paid feature, available with a free 30-day trial'}</p>
                    </Tooltip>
                }
            >
                <span className='inline-block'>
                    {button}
                    <UpsellIcon className={'icon icon-key-variant-circle'}/>
                </span>
            </OverlayTrigger>
        );
    }

    if (isCloudLimitRestricted && !inCall) {
        return (
            <OverlayTrigger
                placement='bottom'
                overlay={
                    <Tooltip id='tooltip-limit-header'>
                        {'Sorry, participants per call are currently limited to 8.'}
                        <p>{'This is because Calls is in the Beta phase. We’re working to remove this limit soon.'}</p>
                    </Tooltip>
                }
            >
                {button}
            </OverlayTrigger>
        );
    }

    return button;
};

export default ChannelHeaderButton;
