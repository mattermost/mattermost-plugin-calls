// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {act, render} from '@testing-library/react';
import {Theme} from 'mattermost-redux/selectors/entities/preferences';
import React from 'react';
import {createIntl} from 'react-intl';
import {Provider} from 'react-redux';
import {MemoryRouter} from 'react-router-dom';
import {AnyAction, applyMiddleware, combineReducers, createStore, Middleware} from 'redux';
import {thunk} from 'redux-thunk';
import {CALL_EVENT} from 'src/clients/call/constants';
import reducer from 'src/reducers';
import {SCREEN_SHARING_CLEARED} from 'src/state/screen_sharing_ids/action_types';
import {USER_MUTED} from 'src/state/session/action_types';
import {installFakeCallClient} from 'src/test_utils/fake_call_client';

import ExpandedView from './component';
import ConnectedExpandedView from './index';

jest.mock('./component', () => ({
    __esModule: true,
    default: jest.fn(() => null),
}));

jest.mock('src/webapp_globals', () => ({
    modals: {openModal: jest.fn()},
}));

const mockedExpandedView = ExpandedView as unknown as jest.Mock;

const CHANNEL_ID = 'channel-id';
const sharer = {session_id: 'sharer-session', user_id: 'sharer', unmuted: false, raised_hand: 0};

const makeStore = () => {
    const actions: AnyAction[] = [];
    const record: Middleware = () => (next) => (action) => {
        actions.push(action as AnyAction);
        return next(action);
    };
    const store = createStore(
        combineReducers({
            'plugins-com.mattermost.calls': reducer,
            entities: (state = {}) => state,
        }),
        {
            'plugins-com.mattermost.calls': {
                sessions: {[CHANNEL_ID]: {[sharer.session_id]: sharer}},
                screenSharingIDs: {[CHANNEL_ID]: sharer.session_id},
            },
            entities: {
                general: {config: {}, license: {}},
                preferences: {myPreferences: {}},
                channels: {
                    channels: {[CHANNEL_ID]: {id: CHANNEL_ID, team_id: 'team-id', name: 'town-square', display_name: 'Town Square', type: 'O'}},
                    myMembers: {},
                },
                teams: {currentTeamId: 'team-id', teams: {'team-id': {id: 'team-id', name: 'team'}}, myMembers: {}},
                users: {
                    currentUserId: 'me',
                    profiles: {
                        me: {id: 'me', username: 'me', roles: 'system_user'},
                        sharer: {id: 'sharer', username: 'sharer', roles: 'system_user'},
                    },
                },
                threads: {threads: {}},
            },
        } as never,
        applyMiddleware(thunk, record),
    );
    return {store, actions};
};

describe('ConnectedExpandedView', () => {
    afterEach(() => {
        window.callsClient = undefined;
    });

    test('syncs the call client into its own store until unsubscribed', () => {
        const client = installFakeCallClient();
        const {store, actions} = makeStore();
        render(
            <Provider store={store}>
                <MemoryRouter>
                    <ConnectedExpandedView
                        theme={{} as Theme}
                        intl={createIntl({locale: 'en', messages: {}})}
                    />
                </MemoryRouter>
            </Provider>,
        );
        const {syncCallClientToStore} = mockedExpandedView.mock.calls[mockedExpandedView.mock.calls.length - 1][0];

        const unsubscribe = syncCallClientToStore(client.asCallClient(), {captions: false, callState: false});
        act(() => {
            client.emit(CALL_EVENT.MUTE, 'session-1', 'user-1');
            client.emit(CALL_EVENT.SCREEN_SHARING_CHANGED, null);
        });

        expect(actions).toContainEqual(expect.objectContaining({type: USER_MUTED, data: expect.objectContaining({channelID: CHANNEL_ID, session_id: 'session-1'})}));
        expect(actions).toContainEqual({type: SCREEN_SHARING_CLEARED, data: {channelID: CHANNEL_ID}});
        expect(store.getState()['plugins-com.mattermost.calls'].screenSharingIDs).toEqual({});

        unsubscribe();
        expect(client.eventNames().filter((event) => client.listenerCount(event) > 0)).toEqual([]);
    });
});
