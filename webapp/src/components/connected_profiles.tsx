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
    border: boolean;
}

const ConnectedProfiles = ({pictures, profiles, maxShowedProfiles, size, fontSize, border}: Props) => {
    maxShowedProfiles = maxShowedProfiles || 2;
    const diff = profiles.length - maxShowedProfiles;
    profiles = diff > 0 ? profiles.slice(0, maxShowedProfiles) : profiles;

    const margin = -8;
    const els = profiles.map((profile, idx) => {
        const off = diff > 0 ? (profiles.length - idx) * 8 : (profiles.length - 1 - idx) * 8;
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
                    border={border}
                    style={{position: 'relative', left: `${margin + off}px`}}
                />
            </OverlayTrigger>
        );
    });

    if (diff > 0) {
        els.push(
            <Avatar
                size={size}
                text={`+${diff}`}
                style={{position: 'relative', left: `${margin}px`}}
                border={border}
                key='call_thread_more_profiles'
            />,
        );
    }

    return <>{els}</>;
};

export default ConnectedProfiles;
