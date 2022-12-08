import {GlobalState} from '@mattermost/types/store';

import {storeKey} from './action_types';

//@ts-ignore GlobalState is not complete
const getState = (state: GlobalState) => state[storeKey] || {};

export const callProfileImages = (state: GlobalState, channelID: string) => {
    if (!getState(state).callProfileImages[channelID]) {
        return {};
    }
    return getState(state).callProfileImages[channelID];
};
