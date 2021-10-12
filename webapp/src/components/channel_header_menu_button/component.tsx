import React from 'react';
import PropTypes from 'prop-types';
import {FormattedMessage} from 'react-intl';

interface Props {
    enabled: boolean,
}

const ChannelHeaderMenuButton = (props: Props) => {
    if (props.enabled) {
        return (
            <FormattedMessage
                id='button.channel.menu'
                defaultMessage='Disable Calls'
            />
        );
    }
    return (
        <FormattedMessage
            id='button.channel.menu'
            defaultMessage='Enable Calls'
        />
    );
};

export default ChannelHeaderMenuButton;
