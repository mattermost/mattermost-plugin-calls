// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {UserSessionState} from '@mattermost/calls-common/lib/types';
import {UserProfile} from '@mattermost/types/users';
import {IDMappedObjects} from '@mattermost/types/utilities';

export function getActiveSpeakerProfile(sessions: UserSessionState[], profiles: IDMappedObjects<UserProfile>): UserProfile | null {
    for (const session of sessions) {
        const profile = profiles[session.user_id];
        if (session.voice && profile) {
            return profile;
        }
    }

    return null;
}
