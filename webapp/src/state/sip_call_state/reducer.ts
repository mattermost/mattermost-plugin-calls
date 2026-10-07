// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Reducer} from 'redux';
import {CALL_END, UN_INITIALIZED} from 'src/state/session/action_types';
import {SIPCallState} from 'src/types/types';

import {SIP_CALL_STATUS_CHANGED} from './action_types';
import {Actions} from './actions';

export type State = {
    [channelID: string]: SIPCallState;
}

const emptyState: State = {};

// Progress of the phone leg of a phone call, keyed by channel. Only the
// client that placed the call receives these updates, through LiveKit.
export const reducer: Reducer<State, Actions> = (state = emptyState, action): State => {
    switch (action.type) {
    case UN_INITIALIZED:
        return emptyState;

    case SIP_CALL_STATUS_CHANGED: {
        const {channelID, status, now} = action.data;
        const current = state[channelID];

        let answeredAt = current?.answeredAt ?? 0;
        if (status === 'active' && !answeredAt) {
            answeredAt = now;
        }

        if (current?.status === status && current.answeredAt === answeredAt) {
            return state;
        }

        return {
            ...state,
            [channelID]: {status, answeredAt},
        };
    }

    case CALL_END: {
        if (!state[action.data.channelID]) {
            return state;
        }
        const nextState = {...state};
        delete nextState[action.data.channelID];
        return nextState;
    }

    default:
        return state;
    }
};
