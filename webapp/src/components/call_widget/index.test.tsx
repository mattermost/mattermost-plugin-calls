// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {render} from '@testing-library/react';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {combineReducers, createStore} from 'redux';
import reducer from 'src/reducers';
import {FakeCallClient, installFakeCallClient} from 'src/test_utils/fake_call_client';

import CallWidget from './component';
import ConnectedCallWidget from './index';

jest.mock('./component', () => ({
    __esModule: true,
    default: jest.fn(() => null),
}));

const mockedCallWidget = CallWidget as unknown as jest.Mock;

const CHANNEL_ID = 'channel-id';

const selfSession = {session_id: 'session-id', user_id: 'me', unmuted: false, raised_hand: 0};
const otherSession = {session_id: 'other-session', user_id: 'other', unmuted: false, raised_hand: 0};

type StateOptions = {
    sessions?: typeof selfSession[];
    cameraOn?: string[];
    enableDMVideo?: boolean;
};

const makeStore = ({sessions = [selfSession, otherSession], cameraOn = [], enableDMVideo = false}: StateOptions = {}) => createStore(
    combineReducers({
        'plugins-com.mattermost.calls': reducer,
        entities: (state = {}) => state,
    }),
    {
        'plugins-com.mattermost.calls': {
            sessions: {[CHANNEL_ID]: Object.fromEntries(sessions.map((s) => [s.session_id, s]))},
            cameraOnIDs: {[CHANNEL_ID]: Object.fromEntries(cameraOn.map((id) => [id, true]))},
            callsConfig: {EnableDMVideo: enableDMVideo},
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
                    other: {id: 'other', username: 'other', roles: 'system_user'},
                },
            },
            threads: {threads: {}},
        },
    } as never,
);

const renderWidget = (options?: StateOptions) => {
    render(
        <Provider store={makeStore(options)}>
            <IntlProvider locale='en'>
                <ConnectedCallWidget/>
            </IntlProvider>
        </Provider>,
    );
    return mockedCallWidget.mock.calls[mockedCallWidget.mock.calls.length - 1][0];
};

describe('ConnectedCallWidget', () => {
    let client: FakeCallClient;

    beforeEach(() => {
        client = installFakeCallClient();
        client.channelID = CHANNEL_ID;
        mockedCallWidget.mockClear();
    });

    afterEach(() => {
        window.callsClient = undefined;
    });

    test('passes our session and whether our camera and the other camera are on', () => {
        const props = renderWidget({cameraOn: ['session-id'], enableDMVideo: true});

        expect(props.currentSession).toEqual(selfSession);
        expect(props.currentSessionID).toBe('session-id');
        expect(props.otherSessions).toEqual([otherSession]);
        expect(props.isCameraOn).toBe(true);
        expect(props.isOtherCameraOn).toBe(false);
        expect(props.dmVideoEnabled).toBe(true);
    });

    test('reads the other camera from the first other session', () => {
        const props = renderWidget({cameraOn: ['other-session']});

        expect(props.isCameraOn).toBe(false);
        expect(props.isOtherCameraOn).toBe(true);
        expect(props.dmVideoEnabled).toBe(false);
    });

    test('takes our session ID from the client while the store has no session for us yet', () => {
        const props = renderWidget({sessions: [], cameraOn: ['session-id']});

        expect(props.currentSession).toBeUndefined();
        expect(props.currentSessionID).toBe('session-id');
        expect(props.otherSessions).toEqual([]);
        expect(props.isCameraOn).toBe(true);
        expect(props.isOtherCameraOn).toBe(false);
    });
});
