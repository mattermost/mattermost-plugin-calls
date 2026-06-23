// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Channel} from '@mattermost/types/channels';
import {UserThread} from '@mattermost/types/threads';
import {UserProfile} from '@mattermost/types/users';
import {Reducer} from 'redux';
import {CALL_ENDED, UN_INITIALIZED} from 'src/state/common_action_types';

import {ACTIVE_CALL_REGISTERED} from './action_types';

type State = {
    [channelID: string]: {
        callID: string;
        startAt: number;
        channelID: Channel['id'];
        threadID: UserThread['id'];
        ownerID: UserProfile['id'];
    };
}

const emptyState: State = {};

export const reducer: Reducer<State> = (initialState = emptyState, action) => {
    switch (action.type) {
    case UN_INITIALIZED:{
        return emptyState;
    }

    case ACTIVE_CALL_REGISTERED: {
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