// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {type Channel} from '@mattermost/types/channels';
import {type UserProfile} from '@mattermost/types/users';
import {ActionCallEnded, ActionUnInitialized} from 'src/state/common_actions';

import {HOST_CHANGED} from './action_types';

export const hostChanged = (channelID: Channel['id'], hostID: UserProfile['id'], hostChangeAt: number) => {
    return {
        type: HOST_CHANGED,
        data: {
            channelID,
            hostID,
            hostChangeAt,
        },
    };
};
export type HostChangedAction = ReturnType<typeof hostChanged>;

export type Actions =
| ActionUnInitialized
| HostChangedAction
| ActionCallEnded;
