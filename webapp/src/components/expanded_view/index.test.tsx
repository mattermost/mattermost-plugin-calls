// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {render} from '@testing-library/react';
import {Theme} from 'mattermost-redux/selectors/entities/preferences';
import React from 'react';
import {createIntl} from 'react-intl';
import {Provider} from 'react-redux';
import {MemoryRouter} from 'react-router-dom';
import {combineReducers, createStore} from 'redux';
import reducer from 'src/reducers';
import {FakeCallClient, installFakeCallClient} from 'src/test_utils/fake_call_client';

import ExpandedView from './component';
import ConnectedExpandedView from './index';

jest.mock('./component', () => ({
    __esModule: true,
    default: jest.fn(() => null),
}));

jest.mock('src/webapp_globals', () => ({
    modals: {openModal: jest.fn()},
    closeRhs: jest.fn(),
    selectRhsPost: jest.fn(),
}));

const mockedExpandedView = ExpandedView as unknown as jest.Mock;

const CHANNEL_ID = 'channel-id';

const selfSession = {session_id: 'session-id', user_id: 'me', unmuted: false, raised_hand: 0};
const otherSession = {session_id: 'other-session', user_id: 'other', unmuted: false, raised_hand: 0};

type StateOptions = {
    sessions?: typeof selfSession[];
    cameraOn?: string[];
    connectionQuality?: Record<string, string>;
    enableDMVideo?: boolean;
    isPhoneCall?: boolean;
};

const makeStore = ({sessions = [selfSession, otherSession], cameraOn = [], connectionQuality = {}, enableDMVideo = false, isPhoneCall = false}: StateOptions = {}) => createStore(
    combineReducers({
        'plugins-com.mattermost.calls': reducer,
        entities: (state = {}) => state,
    }),
    {
        'plugins-com.mattermost.calls': {
            sessions: {[CHANNEL_ID]: Object.fromEntries(sessions.map((s) => [s.session_id, s]))},
            cameraOnIDs: {[CHANNEL_ID]: Object.fromEntries(cameraOn.map((id) => [id, true]))},
            connectionQuality: {[CHANNEL_ID]: connectionQuality},
            calls: {
                [CHANNEL_ID]: {
                    ID: 'call-id',
                    channelID: CHANNEL_ID,
                    phone: isPhoneCall ? {number: '+15550100', displayNumber: '+1 555 0100', label: 'Mobile', targetUserID: 'other'} : undefined,
                },
            },
            callsConfig: {EnableDMVideo: enableDMVideo},
        },
        entities: {
            general: {config: {}, license: {}},
            preferences: {myPreferences: {}},
            channels: {
                channels: {[CHANNEL_ID]: {id: CHANNEL_ID, team_id: '', name: 'me__other', display_name: '', type: 'D'}},
                myMembers: {},
            },
            teams: {currentTeamId: 'team-id', teams: {'team-id': {id: 'team-id', name: 'team'}}, myMembers: {}},
            users: {
                currentUserId: 'me',
                profiles: {
                    me: {id: 'me', username: 'me', roles: 'system_user'},
                    other: {id: 'other', username: 'other', roles: 'system_user'},
                },
            },
            threads: {threads: {}},
        },
    } as never,
);

const renderView = (options?: StateOptions) => {
    render(
        <Provider store={makeStore(options)}>
            <MemoryRouter>
                <ConnectedExpandedView
                    theme={{type: 'Denim'} as Theme}
                    intl={createIntl({locale: 'en', messages: {}})}
                />
            </MemoryRouter>
        </Provider>,
    );
    return mockedExpandedView.mock.calls[mockedExpandedView.mock.calls.length - 1][0];
};

describe('ConnectedExpandedView', () => {
    let client: FakeCallClient;

    beforeEach(() => {
        client = installFakeCallClient();
        client.channelID = CHANNEL_ID;
        mockedExpandedView.mockClear();
    });

    afterEach(() => {
        window.callsClient = undefined;
    });

    test('passes the video settings and our own camera and connection', () => {
        const props = renderView({
            cameraOn: ['session-id'],
            connectionQuality: {'session-id': 'poor'},
            enableDMVideo: true,
        });

        expect(props.currentSession).toEqual(selfSession);
        expect(props.connectedDMUser).toEqual({id: 'other', username: 'other', roles: 'system_user'});
        expect(props.dmVideoEnabled).toBe(true);
        expect(props.isPhoneCall).toBe(false);
        expect(props.isCameraOn).toBe(true);
        expect(props.ownConnectionState).toBe('poor');
    });

    test('ignores the other session\'s camera and connection', () => {
        const props = renderView({
            cameraOn: ['other-session'],
            connectionQuality: {'other-session': 'reconnecting'},
        });

        expect(props.dmVideoEnabled).toBe(false);
        expect(props.isCameraOn).toBe(false);
        expect(props.ownConnectionState).toBe('good');
    });

    test('reports a phone call', () => {
        expect(renderView({isPhoneCall: true}).isPhoneCall).toBe(true);
    });

    test('defaults the camera and connection while the store has no session for us', () => {
        const props = renderView({sessions: [otherSession], cameraOn: ['session-id'], connectionQuality: {'session-id': 'poor'}});

        expect(props.currentSession).toBeUndefined();
        expect(props.isCameraOn).toBe(false);
        expect(props.ownConnectionState).toBe('good');
    });
});
