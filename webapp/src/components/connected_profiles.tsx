import {UserProfile} from '@mattermost/types/users';
import React from 'react';
import {OverlayTrigger, Tooltip} from 'react-bootstrap';
import {useIntl} from 'react-intl';

import {getUserDisplayName, split} from '../utils';

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
    const {formatList} = useIntl();
    maxShowedProfiles = maxShowedProfiles || 2;
    const [showedProfiles, overflowedProfiles] = split(profiles, maxShowedProfiles);

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

    if (overflowedProfiles) {
        els.push(
            <OverlayTrigger
                placement='bottom'
                key='call_thread_more_profiles'
                overlay={
                    <Tooltip
                        id='call-profiles'
                    >
                        {formatList(overflowedProfiles.map((user) => getUserDisplayName(user)))}
                    </Tooltip>
                }
            >
                <Avatar
                    size={size}
                    text={`+${overflowedProfiles.length}`}
                    border={Boolean(border)}
                    key='call_thread_more_profiles'
                />
            </OverlayTrigger>,
        );
    }

    return <>{els}</>;
};

export default ConnectedProfiles;
