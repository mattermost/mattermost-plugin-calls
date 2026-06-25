// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {type Channel} from '@mattermost/types/channels';

import {type ActionCallEnded, type ActionUnInitialized} from '../common_actions';
import {ACTIVE_CALL_ADDED} from './action_types';
import {type ActiveCall} from './reducer';

export const activeCallAdded = (channelID: Channel['id'], activeCall: Omit<ActiveCall, 'channelID'>) => ({
    type: ACTIVE_CALL_ADDED,
    data: {
        callID: activeCall.callID,
        startAt: activeCall.startAt,
        channelID,
        threadID: activeCall.threadID,
        ownerID: activeCall.ownerID,
    },
});
export type ActionActiveCallAdded = ReturnType<typeof activeCallAdded>

export type Actions =
| ActionUnInitialized
| ActionCallEnded
| ActionActiveCallAdded
