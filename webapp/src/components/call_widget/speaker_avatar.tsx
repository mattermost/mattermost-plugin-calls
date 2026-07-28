// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {UserSessionState} from '@mattermost/calls-common/lib/types';
import {GlobalState} from '@mattermost/types/store';
import {UserProfile} from '@mattermost/types/users';
import {IDMappedObjects} from '@mattermost/types/utilities';
import {Client4} from 'mattermost-redux/client';
import {getUser} from 'mattermost-redux/selectors/entities/users';
import React from 'react';
import {useSelector} from 'react-redux';
import Avatar from 'src/components/avatar/avatar';
import {isCurrentDMCallInCallingState, otherUserIDForCurrentDMCall} from 'src/selectors';

interface Props {
    sessions: UserSessionState[];
    profiles: IDMappedObjects<UserProfile>;
}

export function SpeakerAvatar(props: Props) {
    // In a DM channel call, show the other user's avatar when in the calling state.
    const isInCallingStateForDMChannelCall = useSelector(isCurrentDMCallInCallingState);
    const otherUserID = useSelector(otherUserIDForCurrentDMCall);
    const otherUser = useSelector((state: GlobalState) => getUser(state, otherUserID || ''));
    if (isInCallingStateForDMChannelCall) {
        const profilePictureForOtherUser = otherUser && otherUser.id ? Client4.getProfilePictureUrl(otherUser.id, otherUser.last_picture_update || 0) : '';
        if (profilePictureForOtherUser) {
            return (
                <div
                    className='speakerAvatarContainer'
                >
                    <Avatar
                        size={32}
                        border={false}
                        url={profilePictureForOtherUser}
                    />
                </div>
            );
        }

        return (
            <GenericSpeakerAvatar/>
        );
    }

    let speakingPictureURL;
    for (let i = 0; i < props.sessions.length; i++) {
        const session = props.sessions[i];
        const profile = props.profiles[session.user_id];
        if (session.voice && profile) {
            speakingPictureURL = Client4.getProfilePictureUrl(profile.id, profile.last_picture_update);
            break;
        }
    }

    if (speakingPictureURL) {
        return (
            <div
                className='speakerAvatarContainer'
            >
                <Avatar
                    size={32}
                    border={false}
                    url={speakingPictureURL}
                />
            </div>
        );
    }

    return (
        <GenericSpeakerAvatar/>
    );
}

function GenericSpeakerAvatar() {
    return (
        <div
            className='speakerAvatarContainer'
        >
            <Avatar
                size={32}
                icon='account-outline'
                border={false}
                className='genericAvatar'
            />
        </div>
    );
}