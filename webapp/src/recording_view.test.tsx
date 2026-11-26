// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {UserSessionState} from '@mattermost/calls-common/lib/types';
import {act, render, screen} from '@testing-library/react';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {combineReducers, createStore} from 'redux';
import {pluginId} from 'src/manifest';
import {screenSharingCleared, userScreenShared} from 'src/state/screen_sharing_ids/actions';
import {reducer as screenSharingIDs} from 'src/state/screen_sharing_ids/reducer';

import RecordingView from '../../standalone/src/recording/components/recording_view';

// The recorder-only selector lives in the standalone bundle, outside this package.
const noProfileImages = {};
jest.mock('src/recording/selectors', () => ({callProfileImages: () => noProfileImages}), {virtual: true});

jest.mock('plugin/components/expanded_view/participants_grid', () => ({
    ParticipantsGrid: () => <div data-testid='participants-grid'/>,
}));
jest.mock('plugin/components/screen_share_player', () => () => <div data-testid='screen-player'/>);
jest.mock('src/components/reaction_stream/reaction_stream', () => ({ReactionStream: () => null}));
jest.mock('src/components/timestamp', () => () => null);

const channelID = 'channelA';
const sharer = {session_id: 's1', user_id: 'u1'} as UserSessionState;
const other = {session_id: 's2', user_id: 'u2'} as UserSessionState;

const setup = () => {
    const store = createStore(combineReducers({
        [`plugins-${pluginId}`]: combineReducers({
            screenSharingIDs,
            sessions: (s = {[channelID]: {s1: sharer, s2: other}}) => s,
            clientStateReducer: (s = {channelID}) => s,
            hosts: (s = {}) => s,
        }),
        entities: () => ({users: {profiles: {u1: {id: 'u1', username: 'u1'}, u2: {id: 'u2', username: 'u2'}}}}),
    }));

    window.callsClient = {
        channelID,
        getRemoteScreenTrack: () => null,
        on: jest.fn(),
    } as unknown as typeof window.callsClient;

    render(
        <Provider store={store}>
            <IntlProvider locale='en'>
                <RecordingView/>
            </IntlProvider>
        </Provider>,
    );

    return store;
};

describe('RecordingView', () => {
    afterEach(() => {
        delete window.callsClient;
    });

    test('shows the participant grid when nobody is sharing', () => {
        setup();

        expect(screen.getByTestId('participants-grid')).toBeInTheDocument();
        expect(screen.queryByTestId('screen-player')).not.toBeInTheDocument();
    });

    test('swaps the grid for the screen share while someone is sharing', () => {
        const store = setup();

        act(() => {
            store.dispatch(userScreenShared(channelID, sharer.session_id, sharer.user_id));
        });

        expect(screen.getByTestId('screen-player')).toBeInTheDocument();
        expect(screen.queryByTestId('participants-grid')).not.toBeInTheDocument();
    });

    test('returns to the participant grid when the share is cleared', () => {
        const store = setup();

        act(() => {
            store.dispatch(userScreenShared(channelID, sharer.session_id, sharer.user_id));
        });
        expect(screen.queryByTestId('participants-grid')).not.toBeInTheDocument();

        act(() => {
            store.dispatch(screenSharingCleared(channelID));
        });

        expect(screen.getByTestId('participants-grid')).toBeInTheDocument();
        expect(screen.queryByTestId('screen-player')).not.toBeInTheDocument();
    });
});
