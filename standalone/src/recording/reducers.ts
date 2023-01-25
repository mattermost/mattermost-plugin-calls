import {combineReducers, Reducer} from 'redux';

import {
    RECEIVED_CALL_PROFILE_IMAGES,
} from './action_types';

interface callProfileImagesState {
    [channelID: string]: {
        [userID: string]: string,
    },
}

interface callProfileImagesAction {
    type: string,
    data: {
        channelID: string,
        profileImages: {
            [userID: string]: string,
        },
    },
}

const callProfileImages = (state: callProfileImagesState = {}, action: callProfileImagesAction) => {
    switch (action.type) {
    case RECEIVED_CALL_PROFILE_IMAGES: {
        if (!state[action.data.channelID]) {
            return {
                ...state,
                [action.data.channelID]: action.data.profileImages,
            };
        }

        const newState = {
            ...state,
            [action.data.channelID]: {
                ...state[action.data.channelID],
                ...action.data.profileImages,
            },
        };

        return newState;
    }
    default:
        return state;
    }
};

export default combineReducers({
    callProfileImages,
}) as Reducer;
