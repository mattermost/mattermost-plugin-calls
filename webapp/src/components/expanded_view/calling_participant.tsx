// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Pulses in step with the "Calling…" label in the header, which carries the sibling
// callsCallingText class.
import 'src/components/call_widget/calling_state.scss';

import {GlobalState} from '@mattermost/types/store';
import {Client4} from 'mattermost-redux/client';
import {getUser} from 'mattermost-redux/selectors/entities/users';
import React, {useEffect} from 'react';
import {useDispatch, useSelector} from 'react-redux';
import {loadProfilesByIdsIfMissing} from 'src/actions';
import Avatar from 'src/components/avatar/avatar';
import {getUserDisplayName} from 'src/utils';

import {Participant, StyledName, TileSize, tileSizePropsMap} from './call_participant';

type Props = {
    userID: string;
    size: TileSize;
}

// CallingParticipant is the placeholder tile the participants grid shows for the person being
// called while a DM call is still ringing. It sits alongside the caller's own tile and is replaced
// by the callee's real tile once they answer, so it deliberately borrows the grid's geometry and
// leaves out the mute icon, speaking glow, host badge and reactions — none of which mean anything
// before the call connects.
export function CallingParticipant({userID, size}: Props) {
    const dispatch = useDispatch();
    const profile = useSelector((state: GlobalState) => getUser(state, userID));
    const tile = tileSizePropsMap[size];

    // Keyed off the ID rather than the profile: the profile is often not loaded yet (see below), and
    // deriving the URL from it instead yields an empty src and renders a blank white circle.
    // last_picture_update is only a cache buster, so it's fine to fall back to 0 here.
    const pictureURL = Client4.getProfilePictureUrl(userID, profile?.last_picture_update || 0);

    // The callee has no session in the call yet, and loadCallState only fetches profiles for users
    // that do, so nothing has necessarily loaded theirs — a popout in particular starts with an
    // empty store. The avatar URL above doesn't need the profile, but the display name does.
    useEffect(() => {
        dispatch(loadProfilesByIdsIfMissing([userID]));
    }, [dispatch, userID]);

    return (
        <Participant
            className={'callsCallingPulse'}
            data-testid={'calling-participant'}
            $width={tile.avatarSize + (tile.padding * 2)}
            $padding={tile.padding}
            $gap={tile.gap}
        >
            <Avatar
                size={tile.avatarSize}
                fontSize={tile.fontSize}
                border={false}
                url={pictureURL}
            />

            <StyledName
                $fontSize={tile.fontSize}
                $lineHeight={tile.lineHeight}
            >
                {getUserDisplayName(profile)}
            </StyledName>
        </Participant>
    );
}
