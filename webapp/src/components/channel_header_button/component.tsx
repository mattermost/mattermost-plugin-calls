import React from 'react';
import PropTypes from 'prop-types';

import CallIcon from 'components/icons/call_icon';

const ChannelHeaderButton = (props) => {
    if (!props.show) {
        return null;
    }
    return (
        <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
            <CallIcon style={{margin: '0 4px'}}/>
            <span
                className='icon__text'
                style={{margin: '0 4px'}}
            >
                {props.hasCall ? 'Join Call' : 'Start Call'}
            </span>
        </div>
    );
};

ChannelHeaderButton.propTypes = {
    hasCall: PropTypes.bool.isRequired,
    show: PropTypes.bool.isRequired,
};

export default ChannelHeaderButton;
