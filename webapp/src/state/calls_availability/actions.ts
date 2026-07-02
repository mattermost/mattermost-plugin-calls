// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Channel} from '@mattermost/types/channels';
import {getCurrentChannelId} from 'mattermost-redux/selectors/entities/common';
import {DispatchFunc, GetStateFunc} from 'mattermost-redux/types/actions';
import RestClient from 'src/clients/rest';
import {logErr} from 'src/log';
import {ActionUnInitialized} from 'src/state/common_actions';
import {getPluginPath} from 'src/utils';

import {CHANNEL_CALLS_AVAILABILITY_UPDATED} from './action_types';
import {callsNotAvailableInChannel} from './selectors';

export const channelCallsAvailabilityUpdated = (channelID: Channel['id'], enabled?: boolean) => {
    return {
        type: CHANNEL_CALLS_AVAILABILITY_UPDATED,
        data: {
            channelID,
            enabled: enabled ?? true,
        },
    };
};
export type ActionChannelCallsAvailabilityUpdated = ReturnType<typeof channelCallsAvailabilityUpdated>

export const toggleCallsAvailabilityForChannel = () => {
    return async (dispatch: DispatchFunc, getState: GetStateFunc) => {
        const currentChannelID = getCurrentChannelId(getState());

        try {
            const data = await RestClient.fetch<{enabled: boolean}>(`${getPluginPath()}/${currentChannelID}`, {
                method: 'post',
                body: JSON.stringify({enabled: callsNotAvailableInChannel(getState(), currentChannelID)}),
            });

            dispatch(channelCallsAvailabilityUpdated(currentChannelID, data.enabled));
        } catch (err) {
            logErr(err);
        }
    };
};

export type Actions =
  | ActionUnInitialized
  | ActionChannelCallsAvailabilityUpdated;
