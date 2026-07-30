// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {UserProfile} from '@mattermost/types/users';
import {Client4} from 'mattermost-redux/client';
import React from 'react';
import Avatar from 'src/components/avatar/avatar';
import {getUserDisplayName} from 'src/utils';

import {TileSize, tileSizePropsMap} from './participant_cell';

type Props = {
    userID: string;
    profile?: UserProfile;
    tileSize: TileSize;
}

export function ParticipantTileLoading({userID, profile, tileSize}: Props) {
    const tile = tileSizePropsMap[tileSize];

    const pictureURL = Client4.getProfilePictureUrl(userID, profile?.last_picture_update || 0);

    return (
        <li
            className='participantCell pulsingAnimation'
            style={{
                width: `${tile.avatarSize + (tile.padding * 2)}px`,
                padding: `${tile.padding}px`,
                gap: `${tile.gap}px`,
            }}
        >
            <div style={{position: 'relative'}}>
                <Avatar
                    size={tile.avatarSize}
                    fontSize={tile.fontSize}
                    border={false}
                    url={pictureURL}
                />
            </div>
            <span
                className='participantName'
                style={{
                    fontSize: `${tile.fontSize}px`,
                    lineHeight: `${tile.lineHeight}px`,
                }}
            >
                {getUserDisplayName(profile)}
            </span>
        </li>
    );
}
