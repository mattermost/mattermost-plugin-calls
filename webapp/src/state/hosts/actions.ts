// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {type Channel} from '@mattermost/types/channels';
import {Session} from '@mattermost/types/sessions';
import {type UserProfile} from '@mattermost/types/users';
import RestClient from 'src/clients/rest';
import {logErr} from 'src/log';
import {type ActiveCall} from 'src/state/active_calls/reducer';
import {type ActionCallEnded, type ActionUnInitialized} from 'src/state/common_actions';
import {getPluginPath} from 'src/utils';

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

export const hostMakeParticipantHost = async (callID: ActiveCall['callID'], newHostID: UserProfile['id']) => {
    try {
        await RestClient.fetch(`${getPluginPath()}/calls/${callID}/host/make`,
            {
                method: 'post',
                body: JSON.stringify({new_host_id: newHostID}),
            },
        );
    } catch (error) {
        logErr(error);
    }
};

export const hostMuteParticipant = async (callID: ActiveCall['callID'], sessionID: Session['id']) => {
    try {
        await RestClient.fetch(`${getPluginPath()}/calls/${callID}/host/mute`,
            {
                method: 'post',
                body: JSON.stringify({session_id: sessionID}),
            },
        );
    } catch (error) {
        logErr(error);
    }
};

export const hostSwitchParticipantScreenOff = async (callID: ActiveCall['callID'], sessionID: Session['id']) => {
    try {
        await RestClient.fetch(`${getPluginPath()}/calls/${callID}/host/screen-off`,
            {
                method: 'post',
                body: JSON.stringify({session_id: sessionID}),
            },
        );
    } catch (error) {
        logErr(error);
    }
};

export const hostLowerParticipantHand = async (callID: ActiveCall['callID'], sessionID: Session['id']) => {
    try {
        await RestClient.fetch(`${getPluginPath()}/calls/${callID}/host/lower-hand`,
            {
                method: 'post',
                body: JSON.stringify({session_id: sessionID}),
            },
        );
    } catch (error) {
        logErr(error);
    }
};

export const hostRemoveParticipant = async (callID?: ActiveCall['callID'], sessionID?: Session['id']) => {
    try {
        if (!callID || !sessionID) {
            return {};
        }

        await RestClient.fetch(`${getPluginPath()}/calls/${callID}/host/remove`,
            {
                method: 'post',
                body: JSON.stringify({session_id: sessionID}),
            },
        );
    } catch (error) {
        logErr(error);
    }
};

export const hostMuteAllParticipants = async (callID?: ActiveCall['callID']) => {
    if (!callID) {
        return {};
    }

    try {
        await RestClient.fetch(`${getPluginPath()}/calls/${callID}/host/mute-others`,
            {method: 'post'},
        );
    } catch (error) {
        logErr(error);
    }
};

export type Actions =
| ActionUnInitialized
| HostChangedAction
| ActionCallEnded;
