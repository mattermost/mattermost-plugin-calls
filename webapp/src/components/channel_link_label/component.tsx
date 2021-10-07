import React from 'react';
import PropTypes from 'prop-types';

import {Channel} from 'mattermost-redux/types/channels';

import ActiveCallIcon from 'components/icons/active_call_icon';

const ChannelLinkLabel = () => {
    if (this.props.hasCall) {
        return (
            <ActiveCallIcon
                fill='#FFFFFF'
                style={{marginLeft: 'auto', height: 'auto'}}
            />
        );
    }

    return null;
};

ChannelLinkLabel.propTypes = {
    hasCall: PropTypes.bool.isRequired,
};

export default ChannelLinkLabel;
