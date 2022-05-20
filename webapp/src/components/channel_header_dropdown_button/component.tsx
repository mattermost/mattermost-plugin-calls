import React from 'react';

import {OverlayTrigger, Tooltip} from 'react-bootstrap';

import CompassIcon from '../../components/icons/compassIcon';
import {CallButton, UpsellIcon} from 'src/components/shared';

interface Props {
    show: boolean,
    inCall: boolean,
    hasCall: boolean,
    isCloudFeatureRestricted: boolean,
    isCloudLimitRestricted: boolean,
}

const ChannelHeaderDropdownButton = ({
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
    const withUpsellIcon = isCloudFeatureRestricted || (isCloudLimitRestricted && !inCall);

    const button = (
        <CallButton
            id='calls-join-button'
            className={'style--none call-button-dropdown ' + (inCall || restricted ? 'disabled' : '')}
            restricted={restricted}
            noBorder={true}
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
                <UpsellIcon className={'icon icon-key-variant-circle'}/>
            }
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

export default ChannelHeaderDropdownButton;
