// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Channel} from '@mattermost/types/channels';
import {UserProfile} from '@mattermost/types/users';
import {Reducer} from 'redux';
import {CALL_ENDED, UN_INITIALIZED} from 'src/state/common_action_types';

import {HOST_CHANGED} from './action_types';
import {Actions} from './actions';

type Hosts = {
    [channelID: Channel['id']]: {
        hostID: UserProfile['id'];
        hostChangeAt: number;
    }
}

const emptyState: Hosts = {};

export const reducer: Reducer<Hosts, Actions> = (initialState = emptyState, action) => {
    switch (action.type) {
    case UN_INITIALIZED: {
        return emptyState;
    }

    case HOST_CHANGED: {
        return {
            ...initialState,
            [action.data.channelID]: {
                hostID: action.data.hostID,
                hostChangeAt: action.data.hostChangeAt,
            },
        };
    }

    case CALL_ENDED: {
        const nextState = {...initialState};
        delete nextState[action.data.channelID];
        return nextState;
    }

    default:
        return initialState;
    }
};