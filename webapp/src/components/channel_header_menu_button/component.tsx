import React from 'react';
import PropTypes from 'prop-types';
import {FormattedMessage} from 'react-intl';

const ChannelHeaderMenuButton = (props) => {
    if (props.enabled) {
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
};

ChannelHeaderMenuButton.propTypes = {
    enabled: PropTypes.bool.isRequired,
};

export default ChannelHeaderMenuButton;
