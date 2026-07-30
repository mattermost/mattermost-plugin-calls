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

// ParticipantDMCalleeTile is the placeholder tile the participants grid shows for the person being
// called while a DM call is still ringing. It sits alongside the caller's own tile and is replaced by
// the callee's real tile once they answer, so it borrows the grid's geometry but composes the tile
// primitives directly rather than going through ParticipantCell: mute state, the speaking glow,
// reactions, the host badge and host controls all mean nothing before the call connects.
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
