// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {UserSessionState} from '@mattermost/calls-common/lib/types';
import {UserProfile} from '@mattermost/types/users';
import {IDMappedObjects} from '@mattermost/types/utilities';
import {Client4} from 'mattermost-redux/client';
import React from 'react';
import Avatar from 'src/components/avatar/avatar';

interface ParticipantAvatar {
    profile?: UserProfile | null;
}

export function ParticipantAvatar(props: ParticipantAvatar) {
    if (props.profile) {
        const pictureURL = Client4.getProfilePictureUrl(props.profile.id, props.profile.last_picture_update ?? 0);
        return (
            <div
                className='participantAvatarContainer'
            >
                <Avatar
                    size={32}
                    border={false}
                    url={pictureURL}
                />
            </div>
        );
    }

    return (
        <div
            className='participantAvatarContainer'
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

function findActiveSpeakerFromSessions(sessions: UserSessionState[], profiles: IDMappedObjects<UserProfile>): UserProfile | null {
    for (const session of sessions) {
        const profile = profiles[session.user_id];
        if (session.voice && profile) {
            return profile;
        }
    }

    return null;
}

interface SpeakerAvatar {
    sessions: UserSessionState[];
    profiles: IDMappedObjects<UserProfile>;
}

export function SpeakerAvatar(props: SpeakerAvatar) {
    const activeSpeakerProfile = findActiveSpeakerFromSessions(props.sessions, props.profiles);
    return <ParticipantAvatar profile={activeSpeakerProfile}/>;
}
