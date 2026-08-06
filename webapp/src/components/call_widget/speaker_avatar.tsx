// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {UserSessionState} from '@mattermost/calls-common/lib/types';
import {UserProfile} from '@mattermost/types/users';
import {IDMappedObjects} from '@mattermost/types/utilities';
import {Client4} from 'mattermost-redux/client';
import React from 'react';
import Avatar from 'src/components/avatar/avatar';

import {getActiveSpeakerProfile} from './active_speaker';

interface ParticipantAvatarProps {
    profile?: UserProfile | null;
}

export function ParticipantAvatar(props: ParticipantAvatarProps) {
    if (props.profile) {
        const pictureURL = Client4.getProfilePictureUrl(props.profile.id, props.profile.last_picture_update ?? 0);
        return (
            <div className='participantAvatarContainer'>
                <Avatar
                    size={32}
                    border={false}
                    url={pictureURL}
                />
            </div>
        );
    }

    return (
        <div className='participantAvatarContainer'>
            <Avatar
                size={32}
                icon='account-outline'
                border={false}
                className='genericAvatar'
            />
        </div>
    );
}

interface SpeakerAvatarProps {
    sessions: UserSessionState[];
    profiles: IDMappedObjects<UserProfile>;
}

export function SpeakerAvatar(props: SpeakerAvatarProps) {
    const activeSpeakerProfile = getActiveSpeakerProfile(props.sessions, props.profiles);
    return <ParticipantAvatar profile={activeSpeakerProfile}/>;
}
