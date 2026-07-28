// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {UserSessionState} from '@mattermost/calls-common/lib/types';
import {UserProfile} from '@mattermost/types/users';
import {IDMappedObjects} from '@mattermost/types/utilities';
import {Client4} from 'mattermost-redux/client';
import React from 'react';
import Avatar from 'src/components/avatar/avatar';

import {useCallingStateForDMCall} from './use_calling_state_for_dm_call';

interface Props {
    sessions: UserSessionState[];
    profiles: IDMappedObjects<UserProfile>;
}

export function SpeakerAvatar(props: Props) {
    // In a DM channel call, show the other user's avatar when in the calling state.
    const {isInCallingStateForDMChannelCall, otherDMUser} = useCallingStateForDMCall();
    if (isInCallingStateForDMChannelCall) {
        const profilePictureForOtherDMUser = otherDMUser && otherDMUser.id ? Client4.getProfilePictureUrl(otherDMUser.id, otherDMUser.last_picture_update || 0) : '';
        if (profilePictureForOtherDMUser) {
            return (
                <div
                    className='speakerAvatarContainer'
                >
                    <Avatar
                        size={32}
                        border={false}
                        url={profilePictureForOtherDMUser}
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