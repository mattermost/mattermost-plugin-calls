// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {type UserSessionState} from '@mattermost/calls-common/lib/types';
import {type Channel} from '@mattermost/types/channels';
import {type UserProfile} from '@mattermost/types/users';
import {type ActionCallEnded, type ActionUnInitialized} from 'src/state/common_actions';
import {
    type ActionUserLeft,
} from 'src/state/sessions/actions';

import {USER_SCREEN_OFF, USER_SCREEN_ON} from './action_types';

export const userScreenShared = (channelID: Channel['id'], sessionID: UserSessionState['session_id'], userID: UserProfile['id']) => ({
    type: USER_SCREEN_ON,
    data: {
        channelID,
        session_id: sessionID,
        userID,
    },
});
export type ActionUserScreenShared = ReturnType<typeof userScreenShared>

export const userScreenUnshared = (channelID: Channel['id'], sessionID: UserSessionState['session_id'], userID: UserProfile['id']) => ({
    type: USER_SCREEN_OFF,
    data: {
        channelID,
        session_id: sessionID,
        userID,
    },
});
export type ActionUserScreenUnshared = ReturnType<typeof userScreenUnshared>

export type Actions =
  | ActionUnInitialized
  | ActionUserLeft
  | ActionCallEnded
  | ActionUserScreenShared
  | ActionUserScreenUnshared;
