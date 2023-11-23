import {UserProfile} from '@mattermost/types/users';
import {Client4} from 'mattermost-redux/client';
import React from 'react';
import {OverlayTrigger, Tooltip} from 'react-bootstrap';
import {useIntl} from 'react-intl';

import {getUserDisplayName, split} from '../utils';
import Avatar from './avatar/avatar';

interface Props {
    profiles: UserProfile[],
    maxShowedProfiles: number,
    size: number;
    fontSize: number;
    border?: boolean;
}

const ConnectedProfiles = ({profiles, maxShowedProfiles, size, fontSize, border}: Props) => {
    const {formatList} = useIntl();
    maxShowedProfiles = maxShowedProfiles || 2;
    const [showedProfiles, overflowedProfiles] = split(profiles, maxShowedProfiles);

    const els = showedProfiles.map((profile) => {
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
                    url={Client4.getProfilePictureUrl(profile.id, profile.last_picture_update)}
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
