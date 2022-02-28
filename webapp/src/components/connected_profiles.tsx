import React from 'react';
import {OverlayTrigger, Tooltip} from 'react-bootstrap';

import {UserProfile} from 'mattermost-redux/types/users';

import Avatar from './avatar/avatar';

interface Props {
    pictures: string[],
    profiles: UserProfile[],
    maxShowedProfiles: number,
    size: number;
    fontSize: number;
}

const ConnectedProfiles = ({pictures, profiles, maxShowedProfiles, size, fontSize}: Props) => {
    maxShowedProfiles = maxShowedProfiles || 2;
    const diff = profiles.length - maxShowedProfiles;
    profiles = diff > 0 ? profiles.slice(0, maxShowedProfiles) : profiles;

    let off = 0;

    const els = profiles.map((profile, idx) => {
        off += 8;
        return (
            <OverlayTrigger
                placement='bottom'
                key={'call_thread_profile_' + profile.id}
                overlay={
                    <Tooltip id='tooltip-username'>
                        {profile.username}
                    </Tooltip>
                }
            >
                <Avatar
                    size={size}
                    fontSize={fontSize}
                    url={pictures[idx]}
                    style={{position: 'relative', left: `-${off}px`}}
                />
            </OverlayTrigger>
        );
    });

    if (diff > 0) {
        off += 8;
        els.push(
            <Avatar
                size={size}
                text={`+${diff}`}
                style={{position: 'relative', left: `-${off}px`}}
                key='call_thread_more_profiles'
            />,
        );
    }

    return <>{els}</>;
};

export default ConnectedProfiles;
