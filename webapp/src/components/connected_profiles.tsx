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
    border?: boolean;
}

const ConnectedProfiles = ({pictures, profiles, maxShowedProfiles, size, fontSize, border}: Props) => {
    maxShowedProfiles = maxShowedProfiles || 2;
    const diff = profiles.length - maxShowedProfiles;
    profiles = diff > 0 ? profiles.slice(0, maxShowedProfiles) : profiles;

    const els = profiles.map((profile, idx) => {
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
                    border={Boolean(border)}
                />
            </OverlayTrigger>
        );
    });

    if (diff > 0) {
        els.push(
            <Avatar
                size={size}
                text={`+${diff}`}
                border={Boolean(border)}
                key='call_thread_more_profiles'
            />,
        );
    }

    return <>{els}</>;
};

export default ConnectedProfiles;
