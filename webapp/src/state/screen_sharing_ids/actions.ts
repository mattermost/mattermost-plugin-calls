// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {UserSessionState} from '@mattermost/calls-common/lib/types';
import {Channel} from '@mattermost/types/channels';
import {UserProfile} from '@mattermost/types/users';
import {
    ActionCallEnded,
    ActionUnInitialized,
    ActionUserLeft,
} from 'src/state/session/actions';

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
  | ActionUserScreenUnshared