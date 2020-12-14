import React from 'react';
import PropTypes from 'prop-types';

import {FormattedMessage} from 'react-intl';

export default class RHSView extends React.PureComponent {
    static propTypes = {
        channelID: PropTypes.string,
        currChannelID: PropTypes.string,
    }

    render() {
        if (this.props.channelID === this.props.currChannelID) {
            return (
                <FormattedMessage
                    id='button.connect'
                    defaultMessage='Connected Users'
                />
            );
        }

        return (
            <FormattedMessage
                id='button.connect'
                defaultMessage='Connect'
            />
        );
    }
}

