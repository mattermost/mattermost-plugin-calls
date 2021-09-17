import React from 'react';
import PropTypes from 'prop-types';

import {Channel} from 'mattermost-redux/types/channels';

import ActiveCallIcon from 'components/icons/active_call_icon';

export default class ChannelLinkLabel extends React.PureComponent {
    static propTypes = {
        hasCall: PropTypes.bool.isRequired,
    }

    render() {
        if (this.props.hasCall) {
            return (
                <ActiveCallIcon
                    fill='#FFFFFF'
                    style={{marginLeft: 'auto', height: 'auto'}}
                />
            );
        }

        return null;
    }
}

