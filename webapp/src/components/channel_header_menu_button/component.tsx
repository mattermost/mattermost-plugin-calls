import React from 'react';
import PropTypes from 'prop-types';
import {FormattedMessage} from 'react-intl';

export default class ChannelHeaderMenuButton extends React.PureComponent {
    static propTypes = {
        enabled: PropTypes.bool.isRequired,
    }
    render() {
        if (this.props.enabled) {
            return (
                <FormattedMessage
                    id='button.channel.menu'
                    defaultMessage='Disable Voice'
                />
            );
        }
        return (
            <FormattedMessage
                id='button.channel.menu'
                defaultMessage='Enable Voice'
            />
        );
    }
}
