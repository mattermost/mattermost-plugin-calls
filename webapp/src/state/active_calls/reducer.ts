// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {type Channel} from '@mattermost/types/channels';
import {type UserThread} from '@mattermost/types/threads';
import {type UserProfile} from '@mattermost/types/users';
import {type Reducer} from 'redux';
import {CALL_ENDED, UN_INITIALIZED} from 'src/state/common_action_types';

import {ACTIVE_CALL_ADDED} from './action_types';
import {type Actions} from './actions';

export type ActiveCalls = {
    [channelID: string]: {
        callID: string;
        startAt: number;
        channelID: Channel['id'];
        threadID: UserThread['id'];
        ownerID: UserProfile['id'];
    };
}

const emptyState: ActiveCalls = {};

export const reducer: Reducer<ActiveCalls, Actions> = (initialState = emptyState, action) : ActiveCalls => {
    switch (action.type) {
    case UN_INITIALIZED:{
        return emptyState;
    }

    case ACTIVE_CALL_ADDED: {
        return {
            ...initialState,
            [action.data.channelID]: {
                ...action.data,
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
