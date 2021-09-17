import React from 'react';
import PropTypes from 'prop-types';
import {FormattedMessage} from 'react-intl';

import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faPhoneAlt} from '@fortawesome/free-solid-svg-icons';

export default class ChannelHeaderButton extends React.PureComponent {
    static propTypes = {
        userCount: PropTypes.number.isRequired,
        show: PropTypes.bool.isRequired,
    }
    render() {
        if (!this.props.show) {
            return null;
        }
        return (
            <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
                <FontAwesomeIcon
                    icon={faPhoneAlt}
                    style={{marginRight: '4px'}}
                />
                <span
                    className='icon__text'
                >
                    {/* { `${this.props.userCount}` } */}
                    {'Join Call'}
                </span>
            </div>
        );
    }
}
