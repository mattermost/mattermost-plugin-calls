// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {type SessionState} from '@mattermost/calls-common/lib/types/types';
import {type UserProfile} from '@mattermost/types/users';

/**
 * Retrieves a deduplicated list of user IDs from call sessions.
 * Since a user can have multiple sessions (e.g., desktop and mobile), duplicate user IDs are removed.
 */
export function getUserIDsFromSessions(sessions: SessionState[]): Array<UserProfile['id']> {
    const userIDsSet = new Set<UserProfile['id']>();
    for (const session of sessions) {
        userIDsSet.add(session.user_id);
    }

    return Array.from(userIDsSet);
}