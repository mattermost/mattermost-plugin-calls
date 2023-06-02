import React from 'react';
import {OverlayTrigger, Tooltip} from 'react-bootstrap';
import {useIntl} from 'react-intl';

import {UserProfile} from '@mattermost/types/users';

import {getUserDisplayName} from '../utils';

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

    const showedProfiles = diff > 0 ? profiles.slice(0, maxShowedProfiles) : profiles;
    const {formatList} = useIntl();

    const els = showedProfiles.map((profile, idx) => {
        return (
            <OverlayTrigger
                placement='bottom'
                key={'call_thread_profile_' + profile.id}
                overlay={
                    <Tooltip id='tooltip-username'>
                        {getUserDisplayName(profile)}
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
        profiles = profiles.slice(showedProfiles.length);
        els.push(
            <OverlayTrigger
                placement='bottom'
                key='call_thread_more_profiles'
                overlay={
                    <Tooltip
                        id='call-profiles'
                    >
                        {formatList(profiles.map((user) => getUserDisplayName(user)), {type: 'conjunction'})}
                    </Tooltip>
                }
            >
                <Avatar
                    size={size}
                    text={`+${diff}`}
                    border={Boolean(border)}
                    key='call_thread_more_profiles'
                />
            </OverlayTrigger>,
        );
    }

    return <>{els}</>;
};

export default ConnectedProfiles;
