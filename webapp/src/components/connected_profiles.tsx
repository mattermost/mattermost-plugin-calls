// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {UserProfile} from '@mattermost/types/users';
import {Client4} from 'mattermost-redux/client';
import React from 'react';
import {OverlayTrigger, Tooltip} from 'react-bootstrap';
import {useIntl} from 'react-intl';
import styled from 'styled-components';

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

    const els = showedProfiles.map((profile, idx) => {
        return (
            <ProfileItem
                key={'call_thread_profile_' + profile.id}
                $overlap={idx > 0 ? size * 0.25 : 0}
            >
                <OverlayTrigger
                    placement='bottom'
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
            </ProfileItem>
        );
    });

    if (overflowedProfiles) {
        els.push(
            <ProfileItem
                key='call_thread_more_profiles'
                $overlap={showedProfiles.length > 0 ? size * 0.25 : 0}
            >
                <OverlayTrigger
                    placement='bottom'
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
                    />
                </OverlayTrigger>
            </ProfileItem>,
        );
    }

    return <>{els}</>;
};

// Overlap lives here, not on Avatar's :not(:first-child) rule: OverlayTrigger may wrap each avatar in
// a div (React 19 host), which makes every avatar a first child. Zero font-size/line-height avoids
// baseline space under the inline image inside that wrapper.
const ProfileItem = styled.span<{$overlap: number}>`
    display: flex;
    margin-left: -${({$overlap}) => $overlap}px;
    font-size: 0;
    line-height: 0;
`;

export default ConnectedProfiles;
