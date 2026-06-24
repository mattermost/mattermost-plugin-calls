// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Channel} from '@mattermost/types/channels';
import {Reducer} from 'redux';
import {UN_INITIALIZED} from 'src/state/common_action_types';

import {CHANNEL_CALLS_AVAILABILITY_UPDATED} from './action_types';
import {type Actions} from './actions';

type State = {
    [channelID: Channel['id']]: {
        channelID: Channel['id'];
        enabled: boolean;
    };
};

const emptyState: State = {};

export const reducer: Reducer<State, Actions> = (initialState = emptyState, action) => {
    switch (action.type) {
    case UN_INITIALIZED: {
        return emptyState;
    }

    case CHANNEL_CALLS_AVAILABILITY_UPDATED: {
        return {
            ...initialState,
            [action.data.channelID]: {
                channelID: action.data.channelID,
                enabled: action.data.enabled,
            },
        };
    }

    default:
        return initialState;
    }
};
