import React from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';

import {OverlayTrigger, Tooltip} from 'react-bootstrap';

import {UserProfile} from 'mattermost-redux/types/users';

import Avatar, {TAvatarSizeToken} from './avatar/avatar';

interface Props {
    pictures: string[],
    profiles: UserProfile[],
    size?: TAvatarSizeToken,
    maxShowedProfiles: number,
}

export default class ConnectedProfiles extends React.PureComponent<Props> {
    render() {
        const maxShowedProfiles = this.props.maxShowedProfiles || 2;
        const diff = this.props.profiles.length - maxShowedProfiles;
        const profiles = diff > 0 ? this.props.profiles.slice(0, maxShowedProfiles) : this.props.profiles;

        let off = 0;

        const els = profiles.map((profile, idx) => {
            off += 8;
            return (
                <OverlayTrigger
                    placement='bottom'
                    key={'call_thread_profile_' + profile.id}
                    overlay={
                        <Tooltip id='tooltip-username'>
                            { profile.username }
                        </Tooltip>
                    }
                >
                    <Avatar
                        size={this.props.size}
                        url={this.props.pictures[idx]}
                        style={{position: 'relative', left: `-${off}px`}}
                    />
                </OverlayTrigger>
            );
        });

        if (diff > 0) {
            off += 8;
            els.push(
                <Avatar
                    size={this.props.size}
                    text={`+${diff}`}
                    style={{position: 'relative', left: `-${off}px`, background: '#efeff0'}}
                    key='call_thread_more_profiles'
                />,
            );
        }

        return els;
    }
}
