// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {UserSessionState} from '@mattermost/calls-common/lib/types';
import type {Channel} from '@mattermost/types/channels';
import type {UserProfile} from '@mattermost/types/users';
import {render, screen} from '@testing-library/react';
import React from 'react';
import {Provider} from 'react-redux';
import {MemoryRouter} from 'react-router-dom';
import type {AnyAction} from 'redux';
import pluginReducer from 'src/reducers';
import {mockStore} from 'src/testUtils';

// Only the order of the sessions handed to the view matters here.
jest.mock('./component', () => ({
    __esModule: true,
    default: ({sessions}: {sessions: UserSessionState[]}) => (
        <ul>
            {sessions.map((s) => (
                <li
                    key={s.session_id}
                    data-testid='session'
                >
                    {s.user_id}
                </li>
            ))}
        </ul>
    ),
}));

jest.mock('src/webapp_globals', () => ({
    modals: {openModal: jest.fn()},
    closeRhs: jest.fn(),
    selectRhsPost: jest.fn(),
    getRhsSelectedPostId: jest.fn(),
    getIsRhsOpen: jest.fn(),
}));

/* eslint-disable import/order */
import ConnectedExpandedView from './index';
/* eslint-enable import/order */

const dmChannelID = 'dm-channel-id';
const callerID = 'caller-id';
const calleeID = 'callee-id';

// The callee sorts first alphabetically, so the caller only leads on their own side if self-first wins.
const caller = {id: callerID, username: 'zed', first_name: 'Zed', last_name: 'Caller', roles: ''} as UserProfile;
const callee = {id: calleeID, username: 'alice', first_name: 'Alice', last_name: 'Callee', roles: ''} as UserProfile;

const dmChannel = {
    id: dmChannelID,
    team_id: '',
    name: `${calleeID}__${callerID}`,
    display_name: '',
    type: 'D',
} as Channel;

const sessions: UserSessionState[] = [
    {session_id: 'callee-session', user_id: calleeID, unmuted: false, raised_hand: 0},
    {session_id: 'caller-session', user_id: callerID, unmuted: false, raised_hand: 0},
];

const basePluginState = pluginReducer(undefined, {type: '@@INIT'} as AnyAction);

const stubState = (currentUserID: string) => ({
    'plugins-com.mattermost.calls': {
        ...basePluginState,
        calls: {[dmChannelID]: {ID: 'call-id', channelID: dmChannelID, ownerID: callerID, startAt: 0, threadID: ''}},
        sessions: {[dmChannelID]: Object.fromEntries(sessions.map((s) => [s.session_id, s]))},
        clientStateReducer: {channelID: dmChannelID},
    },
    entities: {
        channels: {channels: {[dmChannelID]: dmChannel}},
        users: {currentUserId: currentUserID, profiles: {[callerID]: caller, [calleeID]: callee}},
        teams: {currentTeamId: '', teams: {}},
        threads: {threads: {}},
        general: {config: {}, license: {}},
        preferences: {myPreferences: {}},
    },
});

const ownProps = {} as React.ComponentProps<typeof ConnectedExpandedView>;

const renderAs = (currentUserID: string) => render(
    <Provider store={mockStore(stubState(currentUserID))}>
        <MemoryRouter>
            <ConnectedExpandedView {...ownProps}/>
        </MemoryRouter>
    </Provider>,
);

const sessionOrder = () => screen.getAllByTestId('session').map((el) => el.textContent);

describe('ExpandedView (connected)', () => {
    test('a DM call seen by the caller lists the caller first', () => {
        renderAs(callerID);

        expect(sessionOrder()).toEqual([callerID, calleeID]);
    });

    test('a DM call seen by the callee lists the callee first', () => {
        renderAs(calleeID);

        expect(sessionOrder()).toEqual([calleeID, callerID]);
    });
});
