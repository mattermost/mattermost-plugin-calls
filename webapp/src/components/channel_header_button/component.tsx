import React from 'react';
import PropTypes from 'prop-types';
import {FormattedMessage} from 'react-intl';

import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faHeadset} from '@fortawesome/free-solid-svg-icons';

export default class ChannelHeaderButton extends React.PureComponent {
    static propTypes = {
        userCount: PropTypes.number.isRequired,
    }
    render() {
        return (
            <div>
                <FontAwesomeIcon
                    icon={faHeadset}
                    style={{fontSize: '16px', position: 'relative', top: '1px'}}
                />
                <span
                    className='icon__text'
                >
                    { `${this.props.userCount}` }
                </span>
            </div>
        );
    }
}
