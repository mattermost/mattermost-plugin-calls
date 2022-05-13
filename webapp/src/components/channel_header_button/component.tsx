import React from 'react';
import PropTypes from 'prop-types';

import CompassIcon from '../../components/icons/compassIcon';

interface Props {
    show: boolean,
    inCall: boolean,
    hasCall: boolean,
}

const ChannelHeaderButton = (props: Props) => {
    if (!props.show) {
        return null;
    }
    return (
        <button
            id='calls-join-button'
            className={'style--none call-button ' + (props.inCall ? 'disabled' : '')}
            disabled={Boolean(props.inCall)}
        >
            <CompassIcon icon='phone-outline'/>
            <span
                className='call-button-label'
            >
                {props.hasCall ? 'Join Call' : 'Start Call'}
            </span>
        </button>
    );
};

export default ChannelHeaderButton;
