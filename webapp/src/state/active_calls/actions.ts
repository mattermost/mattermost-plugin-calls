// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {type Channel} from '@mattermost/types/channels';

import {type ActionCallEnded, type ActionUnInitialized} from '../common_actions';
import {ACTIVE_CALL_REGISTERED} from './action_types';
import {type State as ActiveCall} from './reducer';

export const activeCallRegistered = (channelID: Channel['id'], activeCall: Omit<ActiveCall[keyof ActiveCall], 'channelID'>) => ({
    type: ACTIVE_CALL_REGISTERED,
    data: {
        callID: activeCall.callID,
        startAt: activeCall.startAt,
        channelID,
        threadID: activeCall.threadID,
        ownerID: activeCall.ownerID,
        hostID: activeCall.hostID,
    },
});
export type ActionActiveCallRegistered = ReturnType<typeof activeCallRegistered>

export type Actions =
| ActionUnInitialized
| ActionCallEnded
| ActionActiveCallRegistered