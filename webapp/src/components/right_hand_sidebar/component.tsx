import React from 'react';
import PropTypes from 'prop-types';

import {FormattedMessage} from 'react-intl';

import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faMicrophoneAlt, faMicrophoneAltSlash} from '@fortawesome/free-solid-svg-icons';

export default class RHSView extends React.PureComponent {
    static propTypes = {
        profiles: PropTypes.array.isRequired,
        statuses: PropTypes.object.isRequired,
    }

    render() {
        const listItems = this.props.profiles.map((user) => {
            const muteIcon = this.props.statuses[user.id] === false ? faMicrophoneAlt : faMicrophoneAltSlash;
            const muteStyle = this.props.statuses[user.id] === false ? {color: 'inherit'} : {color: '#E00000'};
            return (
                <li key={user.id}>
                    <div style={style.user}>
                        {user.username}
                        <FontAwesomeIcon
                            icon={muteIcon}
                            style={muteStyle}
                        />
                    </div>
                </li>
            );
        });

        return (
            <ul style={style.list}>
                {listItems}
            </ul>
        );
    }
}

const style = {
    list: {
        margin: '0px',
        padding: '0px',
        listStyleType: 'none',
    },
    user: {
        display: 'flex',
        justifyContent: 'space-between',
        width: '100%',
        padding: '8px',
    },
};
