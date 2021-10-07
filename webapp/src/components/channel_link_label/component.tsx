import React from 'react';
import PropTypes from 'prop-types';

import {Channel} from 'mattermost-redux/types/channels';

import ActiveCallIcon from '../../components/icons/active_call_icon';

interface Props {
    hasCall: boolean,
}

const ChannelLinkLabel = (props: Props) => {
    if (props.hasCall) {
        return (
            <ActiveCallIcon
                fill='#FFFFFF'
                style={{marginLeft: 'auto', height: 'auto'}}
            />
        );
    }

    return null;
};

export default ChannelLinkLabel;
