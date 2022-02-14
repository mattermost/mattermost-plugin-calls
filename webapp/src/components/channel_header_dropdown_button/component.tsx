import React from 'react';
import PropTypes from 'prop-types';

import CompassIcon from '../../components/icons/compassIcon';

interface Props {
    show: boolean,
    inCall: boolean,
    hasCall: boolean,
}

const ChannelHeaderDropdownButton = (props: Props) => {
    if (!props.show) {
        return null;
    }
    return (
        <button
            id='calls-join-button'
            className={'style--none call-button-dropdown ' + (props.inCall ? 'disabled' : '')}
            disabled={Boolean(props.inCall)}
        >
            <CompassIcon icon='phone-outline'/>
            <div style={{display: 'flex', flexDirection: 'column'}}>
                <span >
                    {props.hasCall ? 'Join Call' : 'Start Call'}
                </span>
                <span
                    className='call-button-dropdown-sublabel'
                >
                    {'In this channel'}
                </span>
            </div>
        </button>
    );
};

export default ChannelHeaderDropdownButton;
