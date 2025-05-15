// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {applyMiddleware, combineReducers, createStore} from 'redux';
import thunk from 'redux-thunk';

export const mockStore = (initialState = {}) => {
    const reducer = combineReducers({
        'plugins-com.mattermost.calls': (state = {}) => state,
        entities: (state = {}) => state,
    });

    return createStore(
        reducer,
        initialState,
        applyMiddleware(thunk),
    );
};
