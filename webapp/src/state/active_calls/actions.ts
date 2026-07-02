// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {type Channel} from '@mattermost/types/channels';
import RestClient from 'src/clients/rest';
import {getPluginPath} from 'src/utils';

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

export const fetchIsCallActiveInChannel = async (channelID: Channel['id']): Promise<boolean> => {
    try {
        const data = await RestClient.fetch<{active: boolean}>(`${getPluginPath()}/calls/${channelID}/active`, {
            method: 'get',
        });

        return data.active;
    } catch (e) {
        return false;
    }
};

export type Actions =
| ActionUnInitialized
| ActionCallEnded
| ActionActiveCallAdded
