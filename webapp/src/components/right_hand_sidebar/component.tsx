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
        // console.log(this.props.statuses);
        const listItems = this.props.profiles.map((user) => {
            const muteIcon = this.props.statuses[user.id] && this.props.statuses[user.id].unmuted === true ? faMicrophoneAlt : faMicrophoneAltSlash;
            const muteStyle = this.props.statuses[user.id] && this.props.statuses[user.id].unmuted === true ? {color: 'inherit'} : {color: '#E00000'};
            const voiceStyle = this.props.statuses[user.id] && this.props.statuses[user.id].voice === true ? {fontWeight: 'bold'} : {fontWeight: 'normal'};
            return (
                <li key={user.id}>
                    <div style={style.user}>
                        <span style={voiceStyle}>{user.username}</span>
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
