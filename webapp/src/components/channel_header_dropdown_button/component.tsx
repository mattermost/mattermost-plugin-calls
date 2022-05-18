import React from 'react';
import PropTypes from 'prop-types';

import CompassIcon from '../../components/icons/compassIcon';
import {CLOUD_MAX_PARTICIPANTS} from 'src/constants';
import {OverlayTrigger, Tooltip} from 'react-bootstrap';

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
    const disabled = inCall || isCloudFeatureRestricted || isCloudLimitRestricted;

    const button = (
        <button
            id='calls-join-button'
            className={'style--none call-button-dropdown ' + (disabled ? 'disabled' : '')}
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
        </button>
    );

    // TODO: to be finished in MM-44112
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
