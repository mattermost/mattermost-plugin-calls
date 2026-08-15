// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {UserSessionState} from '@mattermost/calls-common/lib/types';
import type {Channel} from '@mattermost/types/channels';
import type {UserProfile} from '@mattermost/types/users';
import {render, screen, within} from '@testing-library/react';
import React from 'react';
import {createIntl, RawIntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import type {AnyAction} from 'redux';
import pluginReducer from 'src/reducers';
import {mockStore} from 'src/testUtils';
import {CallsConfigDefault} from 'src/types/types';

// The component reads window.ProductApi at module scope for its contextType, so the global has
// to exist before it is required.
window.ProductApi = {
    WebSocketProvider: React.createContext(null),
} as unknown as typeof window.ProductApi;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ExpandedView = require('./component').default;

type Props = React.ComponentProps<typeof ExpandedView>;

// Ships as ESM, which jest won't parse.
jest.mock('media-chrome/dist/react', () => ({
    MediaControlBar: 'div',
    MediaController: 'div',
    MediaFullscreenButton: 'div',
}));

jest.mock('src/components/dot_menu/dot_menu', () => ({
    __esModule: true,
    default: 'div',
    DotMenuButton: 'div',
    DropdownMenu: 'div',
    DropdownMenuItem: 'div',
}));

// Each tile has its own tests; the grid only has to say it took over the body.
jest.mock('./participants_grid', () => ({
    ParticipantsGrid: () => <div data-testid={'calls-popout-participants-grid'}/>,
}));

const intl = createIntl({locale: 'en', messages: {}});

const dmChannelID = 'dm-channel-id';
const callID = 'call-id';
const calleeID = 'other-user-id';

const caller = {id: 'user-id', username: 'caller', first_name: 'First1', last_name: 'Last1', roles: ''} as UserProfile;
const callee = {id: calleeID, username: 'callee', first_name: 'First2', last_name: 'Last2', roles: ''} as UserProfile;

const dmChannel = {
    id: dmChannelID,
    team_id: 'team-id',
    name: `user-id__${calleeID}`,
    display_name: 'First2 Last2',
    type: 'D',
} as Channel;

const stubSession = (sessionID: string, userID: string, video = false): UserSessionState => ({
    session_id: sessionID,
    user_id: userID,
    unmuted: false,
    raised_hand: 0,
    video,
});

// The expanded view pulls on far more of the plugin store than this test cares about, so the
// slice starts from what the real reducers produce rather than a hand-written stub.
const basePluginState = pluginReducer(undefined, {type: '@@INIT'} as AnyAction);

const dmState = (sessions: UserSessionState[]) => ({
    'plugins-com.mattermost.calls': {
        ...basePluginState,
        calls: {[dmChannelID]: {ID: callID, channelID: dmChannelID, ownerID: 'user-id', startAt: 0, threadID: ''}},
        sessions: {[dmChannelID]: Object.fromEntries(sessions.map((s) => [s.session_id, s]))},
        callsConfig: {...CallsConfigDefault, EnableVideo: true},
    },
    entities: {
        channels: {channels: {[dmChannelID]: dmChannel}},
        users: {currentUserId: 'user-id', profiles: {'user-id': caller, [calleeID]: callee}},
    },
});

const props = {
    theme: {sidebarBg: '#1e325c', centerChannelColor: '#3f4350'},
    show: true,
    currentUserID: 'user-id',
    currentTeamID: 'team-id',
    profiles: {'user-id': caller, [calleeID]: callee},
    sessions: [],
    sessionsMap: {},
    callHostID: 'user-id',
    callHostChangeAt: 0,
    isRecording: false,
    hideExpandedView: jest.fn(),
    showScreenSourceModal: jest.fn(),
    prefetchThread: jest.fn(),
    channel: dmChannel,
    channelDisplayName: dmChannel.display_name,
    connectedDMUser: callee,
    threadID: '',
    threadUnreadReplies: 0,
    threadUnreadMentions: 0,
    allowScreenSharing: true,
    recordingsEnabled: false,
    recordingMaxDuration: 0,
    startCallRecording: jest.fn(),
    recordingPromptDismissedAt: jest.fn(),
    transcriptionsEnabled: false,
    isAdmin: false,
    hostControlsAllowed: false,
    openModal: jest.fn(),
    enableVideo: true,
    otherSessions: [],
    isDMCalling: true,
    clientConnecting: false,
    intl,
} as unknown as Props;

const renderExpandedView = (sessions: UserSessionState[], overrides: Partial<Props> = {}) => render(
    <Provider store={mockStore(dmState(sessions))}>
        <RawIntlProvider value={intl}>
            <ExpandedView
                {...props}
                sessions={sessions}
                currentSession={sessions.find((s) => s.user_id === 'user-id')}
                otherSessions={sessions.filter((s) => s.user_id !== 'user-id')}
                isDMCalling={sessions.every((s) => s.user_id === 'user-id')}
                {...overrides}
            />
        </RawIntlProvider>
    </Provider>,
);

describe('ExpandedView', () => {
    beforeEach(() => {
        window.callsClient = {
            disconnect: jest.fn(),
            channelID: dmChannelID,
            getSessionID: () => 'session-1',
            getRemoteVoiceTracks: () => [],
            getRemoteScreenStream: () => null,
            getLocalScreenStream: () => null,
            on: jest.fn(),
            off: jest.fn(),
        } as unknown as (typeof window)['callsClient'];
    });

    afterEach(() => {
        window.callsClient = undefined;
    });

    // With the camera off nobody has video, so the grid keeps the body and renders the callee
    // placeholder itself.
    test('a ringing DM call with the camera off leaves the body to the participants grid', () => {
        renderExpandedView([stubSession('session-1', 'user-id')]);

        expect(screen.getByTestId('calls-popout-participants-grid')).toBeInTheDocument();
        expect(screen.queryByTestId('calls-popout-video-profile-ringing')).not.toBeInTheDocument();
    });

    test('a ringing DM call with the camera on still shows the callee', () => {
        renderExpandedView([stubSession('session-1', 'user-id', true)]);

        expect(screen.queryByTestId('calls-popout-participants-grid')).not.toBeInTheDocument();
        expect(screen.getByTestId('calls-popout-video-profile-ringing')).toBeInTheDocument();
    });

    test('the ringing callee avatar pulses', () => {
        renderExpandedView([stubSession('session-1', 'user-id', true)]);

        expect(within(screen.getByTestId('calls-popout-video-profile-ringing')).getByAltText(/profile image/)).toHaveClass('pulsingAnimation');
    });

    // The callee's placeholder takes the main area, so the caller's own video moves to the top
    // strip exactly as it does once the call is answered.
    test('a ringing DM call with the camera on keeps the caller in the top strip', () => {
        renderExpandedView([stubSession('session-1', 'user-id', true)]);

        expect(screen.getByTestId('calls-popout-video-profile-self')).toBeInTheDocument();
    });

    test('an answered DM call with the camera on drops the callee placeholder', () => {
        renderExpandedView([stubSession('session-1', 'user-id', true), stubSession('session-2', calleeID)]);

        expect(screen.queryByTestId('calls-popout-video-profile-ringing')).not.toBeInTheDocument();
    });
});
