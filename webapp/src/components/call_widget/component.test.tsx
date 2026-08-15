// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {UserSessionState} from '@mattermost/calls-common/lib/types';
import type {Channel} from '@mattermost/types/channels';
import type {Team} from '@mattermost/types/teams';
import type {UserProfile} from '@mattermost/types/users';
import {render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {createIntl, RawIntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import type CallsClient from 'src/client';
import {mockStore} from 'src/testUtils';

import CallWidget from './component';

type Props = React.ComponentProps<typeof CallWidget>;

jest.mock('src/components/incoming_calls/ringback_container', () => ({
    RingbackContainer: () => null,
}));

jest.mock('src/components/leave_call_menu', () => ({
    LeaveCallMenu: ({leaveCall}: {leaveCall: () => void}) => (
        // eslint-disable-next-line formatjs/no-literal-string-in-jsx
        <button onClick={leaveCall}>{'Leave call'}</button>
    ),
}));

jest.mock('src/components/dot_menu/dot_menu', () => {
    return {
        __esModule: true,
        default: ({children}: {children: React.ReactNode}) => <div>{children}</div>,
        DotMenuButton: 'div',
        DropdownMenu: 'div',
        DropdownMenuItem: ({children, onClick}: {children: React.ReactNode; onClick?: () => void}) => (
            <button onClick={onClick}>{children}</button>
        ),
        DropdownMenuSeparator: () => null,
    };
});

const intl = createIntl({locale: 'en', messages: {}});

const stubChannel = {
    id: 'channel-id',
    team_id: 'team-id',
    name: 'town-square',
    display_name: 'Town Square',
    type: 'O',
} as Channel;

const stubTeam = {id: 'team-id', name: 'team', display_name: 'Team'} as Team;

// The widget renders store-connected children (e.g. SpeakerAvatar), so the store needs
// the same shape the reducers produce rather than a bare {}. No call is in progress, so
// the widget renders purely from the props passed in below.
// The other user's profile is seeded because useDMCallingState fetches it over the network
// when a DM call's callee is missing from the store, which jsdom has no fetch for.
const stubState = (channel: Channel) => ({
    'plugins-com.mattermost.calls': {
        calls: {},
        sessions: {},
        dmCalleeAnsweredAt: {},
    },
    entities: {
        channels: {channels: {[channel.id]: channel}},
        users: {
            currentUserId: 'user-id',
            profiles: {'other-user': {id: 'other-user', username: 'callee'} as UserProfile},
        },
    },
});

const props: Props = {
    intl,
    currentUserID: 'user-id',
    channel: stubChannel,
    team: stubTeam,
    channelURL: '/town-square',
    channelDisplayName: 'Town Square',
    sessions: [],
    otherSessions: [],
    sessionsMap: {},
    profiles: {},
    callHostID: 'user-id',
    callHostChangeAt: 0,
    isRecording: false,
    show: true,
    showExpandedView: jest.fn(),
    showScreenSourceModal: jest.fn(),
    recordingPromptDismissedAt: jest.fn(),
    allowScreenSharing: true,
    recentlyJoinedUsers: [],
    hostNotices: [],
    wider: false,
    callsIncoming: [],
    transcriptionsEnabled: false,
    clientConnecting: false,
    selectRHSPost: jest.fn(),
    startCallRecording: jest.fn(),
    stopCallRecording: jest.fn(),
    recordingsEnabled: false,
    openModal: jest.fn(),
    openCallsUserSettings: jest.fn(),
    enableVideo: false,
    currentUserProfile: undefined,
    connectedDMUser: undefined,
    isAdmin: false,
    isDMCalling: false,
};

describe('CallWidget', () => {
    let originalCallsClient: typeof window.callsClient;
    let disconnect: jest.Mock;
    let openSpy: jest.SpyInstance;

    beforeEach(() => {
        originalCallsClient = window.callsClient;
        disconnect = jest.fn();
        window.callsClient = {
            disconnect,
            channelID: 'channel-id',
            getRemoteVoiceTracks: () => [],
            getRemoteScreenStream: () => null,
            getLocalScreenStream: () => null,
            on: jest.fn(),
            off: jest.fn(),
        } as unknown as CallsClient;
        openSpy = jest.spyOn(window, 'open');
    });

    afterEach(() => {
        window.callsClient = originalCallsClient;
        openSpy.mockRestore();
    });

    test('closes the popout and disconnects when the popout is still open', async () => {
        const fakePopout = {
            closed: false,
            close: jest.fn(),
            addEventListener: jest.fn(),
        };
        openSpy.mockReturnValue(fakePopout as unknown as Window);
        const user = userEvent.setup();

        render(
            <Provider store={mockStore(stubState(stubChannel))}>
                <RawIntlProvider value={intl}>
                    <CallWidget {...props}/>
                </RawIntlProvider>
            </Provider>,
        );

        await user.click(screen.getByRole('button', {name: /open in new window/i}));
        expect(openSpy).toHaveBeenCalled();

        await user.click(screen.getByRole('button', {name: /^leave call$/i}));

        expect(fakePopout.close).toHaveBeenCalledTimes(1);
        expect(disconnect).toHaveBeenCalledTimes(1);
    });

    test('disconnects without calling close when the popout is already closed', async () => {
        const fakePopout = {
            closed: true,
            close: jest.fn(),
            addEventListener: jest.fn(),
        };
        openSpy.mockReturnValue(fakePopout as unknown as Window);
        const user = userEvent.setup();

        render(
            <Provider store={mockStore(stubState(stubChannel))}>
                <RawIntlProvider value={intl}>
                    <CallWidget {...props}/>
                </RawIntlProvider>
            </Provider>,
        );

        await user.click(screen.getByRole('button', {name: /open in new window/i}));
        await user.click(screen.getByRole('button', {name: /^leave call$/i}));

        expect(fakePopout.close).not.toHaveBeenCalled();
        expect(disconnect).toHaveBeenCalledTimes(1);
    });

    test('disconnects when no popout was ever opened', async () => {
        const user = userEvent.setup();

        render(
            <Provider store={mockStore(stubState(stubChannel))}>
                <RawIntlProvider value={intl}>
                    <CallWidget {...props}/>
                </RawIntlProvider>
            </Provider>,
        );

        await user.click(screen.getByRole('button', {name: /^leave call$/i}));

        expect(disconnect).toHaveBeenCalledTimes(1);
    });
});

describe('leave button behavior', () => {
    let disconnect: jest.Mock;

    const stubSession = (sessionId: string, userId: string): UserSessionState => ({
        session_id: sessionId,
        user_id: userId,
        unmuted: false,
        raised_hand: 0,
    });

    const dmChannel = {...stubChannel, type: 'D', name: 'user-id__other-user'} as Channel;
    const currentUserSession = stubSession('session-1', 'user-id');
    const otherSession = stubSession('session-2', 'other-user');

    beforeEach(() => {
        disconnect = jest.fn();
        window.callsClient = {
            disconnect,
            channelID: 'channel-id',
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

    test('DM channel: leaves directly without menu even when host with others', async () => {
        const user = userEvent.setup();
        render(
            <Provider store={mockStore(stubState(dmChannel))}>
                <RawIntlProvider value={intl}>
                    <CallWidget
                        {...props}
                        channel={dmChannel}
                        sessions={[currentUserSession, otherSession]}
                        callHostID='user-id'
                    />
                </RawIntlProvider>
            </Provider>,
        );

        expect(screen.queryByText('Leave call')).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', {name: /^leave call$/i}));
        expect(disconnect).toHaveBeenCalledTimes(1);
    });

    test('non-host and non-admin with others: leaves directly without menu', async () => {
        const user = userEvent.setup();
        render(
            <Provider store={mockStore(stubState(stubChannel))}>
                <RawIntlProvider value={intl}>
                    <CallWidget
                        {...props}
                        sessions={[currentUserSession, otherSession]}
                        callHostID='other-user'
                        isAdmin={false}
                    />
                </RawIntlProvider>
            </Provider>,
        );

        expect(screen.queryByText('Leave call')).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', {name: /^leave call$/i}));
        expect(disconnect).toHaveBeenCalledTimes(1);
    });

    test('solo host: leaves directly without menu', async () => {
        const user = userEvent.setup();
        render(
            <Provider store={mockStore(stubState(stubChannel))}>
                <RawIntlProvider value={intl}>
                    <CallWidget
                        {...props}
                        sessions={[currentUserSession]}
                        callHostID='user-id'
                        isAdmin={false}
                    />
                </RawIntlProvider>
            </Provider>,
        );

        expect(screen.queryByText('Leave call')).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', {name: /^leave call$/i}));
        expect(disconnect).toHaveBeenCalledTimes(1);
    });

    test('host with other participants: shows leave menu, leave call disconnects', async () => {
        const user = userEvent.setup();
        render(
            <Provider store={mockStore(stubState(stubChannel))}>
                <RawIntlProvider value={intl}>
                    <CallWidget
                        {...props}
                        sessions={[currentUserSession, otherSession]}
                        callHostID='user-id'
                        isAdmin={false}
                    />
                </RawIntlProvider>
            </Provider>,
        );

        const leaveButton = screen.getByText('Leave call');
        expect(leaveButton).toBeInTheDocument();

        await user.click(leaveButton);
        expect(disconnect).toHaveBeenCalledTimes(1);
    });

    test('admin (non-host) with other participants: shows leave menu, leave call disconnects', async () => {
        const user = userEvent.setup();
        render(
            <Provider store={mockStore(stubState(stubChannel))}>
                <RawIntlProvider value={intl}>
                    <CallWidget
                        {...props}
                        sessions={[currentUserSession, otherSession]}
                        callHostID='other-user'
                        isAdmin={true}
                    />
                </RawIntlProvider>
            </Provider>,
        );

        const leaveButton = screen.getByText('Leave call');
        expect(leaveButton).toBeInTheDocument();

        await user.click(leaveButton);
        expect(disconnect).toHaveBeenCalledTimes(1);
    });
});

describe('DM call presentation', () => {
    const dmChannelID = 'dm-channel-id';
    const callID = 'call-id';
    const calleeID = 'other-user-id';

    const callee = {
        id: calleeID,
        username: 'callee',
        first_name: 'Other',
        last_name: 'User',
        roles: '',
    } as UserProfile;

    const dmChannel = {
        id: dmChannelID,
        team_id: 'team-id',
        name: `user-id__${calleeID}`,
        display_name: 'Other User',
        type: 'D',
    } as Channel;

    const stubSession = (sessionID: string, userID: string): UserSessionState => ({
        session_id: sessionID,
        user_id: userID,
        unmuted: false,
        raised_hand: 0,
    });

    const ownSession = stubSession('session-1', 'user-id');
    const calleeSession = stubSession('session-2', calleeID);

    // The calling state is derived entirely from the store, so it needs a real call owned by the
    // current user plus whichever sessions have joined so far.
    const dmState = (sessions: UserSessionState[]) => ({
        'plugins-com.mattermost.calls': {
            calls: {[dmChannelID]: {ID: callID, channelID: dmChannelID, ownerID: 'user-id', startAt: Date.now(), threadID: ''}},
            sessions: {[dmChannelID]: Object.fromEntries(sessions.map((s) => [s.session_id, s]))},
            dmCalleeAnsweredAt: {},
        },
        entities: {
            channels: {channels: {[dmChannelID]: dmChannel}},
            users: {currentUserId: 'user-id', profiles: {[calleeID]: callee}},
        },
    });

    const renderWidget = (channel: Channel, sessions: UserSessionState[], clientConnecting = false) => render(
        <Provider store={mockStore(dmState(sessions))}>
            <RawIntlProvider value={intl}>
                <CallWidget
                    {...props}
                    channel={channel}
                    channelDisplayName={channel.display_name}
                    sessions={sessions}
                    otherSessions={sessions.filter((s) => s.user_id !== 'user-id')}
                    profiles={{[calleeID]: callee}}
                    clientConnecting={clientConnecting}
                />
            </RawIntlProvider>
        </Provider>,
    );

    let disconnect: jest.Mock;

    beforeEach(() => {
        disconnect = jest.fn();
        window.callsClient = {
            disconnect,
            channelID: dmChannelID,
            getSessionID: () => ownSession.session_id,
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

    test('a ringing DM call shows the callee and Calling… in place of the timer', () => {
        renderWidget(dmChannel, [ownSession]);

        expect(screen.getByText('Calling…')).toBeInTheDocument();
        expect(screen.getByText('Other User')).toBeInTheDocument();
        expect(screen.queryByText(/is talking…$/)).not.toBeInTheDocument();
        expect(screen.queryByText(/^\d{2}:\d{2}$/)).not.toBeInTheDocument();
    });

    test('a DM call that has been answered swaps Calling… for the elapsed timer', () => {
        renderWidget(dmChannel, [ownSession, calleeSession]);

        expect(screen.queryByText('Calling…')).not.toBeInTheDocument();
        expect(screen.getByText(/^\d{2}:\d{2}$/)).toBeInTheDocument();
    });

    test('a DM call hides the participants button and the channel name', () => {
        renderWidget(dmChannel, [ownSession, calleeSession]);

        expect(screen.queryByRole('button', {name: /participants/i})).not.toBeInTheDocument();
        expect(screen.queryByRole('link', {name: /Other User/})).not.toBeInTheDocument();
    });

    test('a channel call keeps the participants button and the channel name', () => {
        renderWidget(stubChannel, [ownSession, calleeSession]);

        expect(screen.getByRole('button', {name: /participants/i})).toBeInTheDocument();
        expect(screen.getByRole('link', {name: /Town Square/})).toBeInTheDocument();
        expect(screen.queryByText('Calling…')).not.toBeInTheDocument();
    });

    test('a DM call still connecting shows the callee and Starting call… in place of the timer', () => {
        renderWidget(dmChannel, [ownSession], true);

        expect(screen.getByText('Starting call…')).toBeInTheDocument();
        expect(screen.getByText('Other User')).toBeInTheDocument();
        expect(screen.queryByText('Calling…')).not.toBeInTheDocument();
        expect(screen.queryByText(/^\d{2}:\d{2}$/)).not.toBeInTheDocument();
    });

    test('a DM call still connecting is not also covered by the loading overlay', () => {
        renderWidget(dmChannel, [ownSession], true);

        expect(screen.queryByTestId('calls-widget-loading-overlay')).not.toBeInTheDocument();
    });

    // There is no call to act on until the client finishes connecting, so the controls stay inert.
    test.each([
        ['expand', /open in new window/i],
        ['settings', /more options/i],
        ['leave', /^leave call$/i],
    ])('a DM call still connecting disables the %s button', (_, name) => {
        renderWidget(dmChannel, [ownSession], true);

        expect(screen.getByRole('button', {name})).toBeDisabled();
    });

    test.each([
        ['expand', /open in new window/i],
        ['settings', /more options/i],
        ['leave', /^leave call$/i],
    ])('a connected DM call leaves the %s button usable', (_, name) => {
        renderWidget(dmChannel, [ownSession, calleeSession]);

        expect(screen.getByRole('button', {name})).toBeEnabled();
    });

    test('a DM call still connecting does not disconnect when leave is clicked', async () => {
        const user = userEvent.setup();
        renderWidget(dmChannel, [ownSession], true);

        await user.click(screen.getByRole('button', {name: /^leave call$/i}));

        expect(disconnect).not.toHaveBeenCalled();
    });
});

describe('DM call presentation with video enabled', () => {
    const dmChannelID = 'dm-channel-id';
    const callID = 'call-id';
    const calleeID = 'other-user-id';

    const caller = {
        id: 'user-id',
        username: 'caller',
        first_name: 'First1',
        last_name: 'Last1',
        roles: '',
    } as UserProfile;

    const callee = {
        id: calleeID,
        username: 'callee',
        first_name: 'First2',
        last_name: 'Last2',
        roles: '',
    } as UserProfile;

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

    const ownSession = stubSession('session-1', 'user-id');
    const calleeSession = stubSession('session-2', calleeID);

    const dmState = (sessions: UserSessionState[]) => ({
        'plugins-com.mattermost.calls': {
            calls: {[dmChannelID]: {ID: callID, channelID: dmChannelID, ownerID: 'user-id', startAt: Date.now(), threadID: ''}},
            sessions: {[dmChannelID]: Object.fromEntries(sessions.map((s) => [s.session_id, s]))},
            dmCalleeAnsweredAt: {},
        },
        entities: {
            channels: {channels: {[dmChannelID]: dmChannel}},
            users: {currentUserId: 'user-id', profiles: {'user-id': caller, [calleeID]: callee}},
        },
    });

    // enableVideo swaps the widget onto the video render path, where the body is a row of
    // profile tiles rather than a single header avatar.
    const renderWidget = (sessions: UserSessionState[], overrides: Partial<Props> = {}) => render(
        <Provider store={mockStore(dmState(sessions))}>
            <RawIntlProvider value={intl}>
                <CallWidget
                    {...props}
                    channel={dmChannel}
                    channelDisplayName={dmChannel.display_name}
                    sessions={sessions}
                    otherSessions={sessions.filter((s) => s.user_id !== 'user-id')}
                    currentSession={sessions.find((s) => s.user_id === 'user-id')}
                    profiles={{'user-id': caller, [calleeID]: callee}}
                    currentUserProfile={caller}
                    connectedDMUser={callee}
                    enableVideo={true}
                    isDMCalling={sessions.length > 0 && sessions.every((s) => s.user_id === 'user-id')}
                    {...overrides}
                />
            </RawIntlProvider>
        </Provider>,
    );

    beforeEach(() => {
        window.callsClient = {
            disconnect: jest.fn(),
            channelID: dmChannelID,
            getSessionID: () => ownSession.session_id,
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

    // The body should not materialise partway through call setup, so the same two tiles are on
    // screen from "Starting call…" all the way through to an answered call.
    const stages: Array<[string, UserSessionState[], Partial<Props>]> = [
        ['still connecting', [], {clientConnecting: true, profiles: {}}],
        ['ringing', [ownSession], {}],
        ['answered', [ownSession, calleeSession], {}],
    ];

    test.each(stages)('a DM call %s shows two tiles', (_, sessions, overrides) => {
        renderWidget(sessions, overrides);

        expect(screen.getAllByTestId(/^calls-widget-profile-(ringing|self|other)$/)).toHaveLength(2);
    });

    // Nothing has a session yet, and the call's profile map is built from sessions, so the
    // caller's own tile has to fall back to their profile from the store.
    test('a DM call still connecting shows the callee and the caller', () => {
        renderWidget([], {clientConnecting: true, profiles: {}});

        expect(screen.getByTestId('calls-widget-profile-ringing')).toBeInTheDocument();
        expect(screen.getByTestId('calls-widget-profile-self')).toBeInTheDocument();
    });

    // A DM call auto-unmutes on connect, so the caller's session lands muted for a moment. A
    // badge driven straight off the session would blink on and back off across this transition.
    test.each(stages.filter(([stage]) => stage !== 'answered'))('a DM call %s shows no mute badge on either tile', (_, sessions, overrides) => {
        renderWidget(sessions, overrides);

        expect(screen.queryByTestId('calls-widget-profile-mute-state')).not.toBeInTheDocument();
    });

    test('a ringing DM call shows the callee alongside the caller instead of the caller alone', () => {
        renderWidget([ownSession]);

        expect(screen.getByTestId('calls-widget-profile-ringing')).toBeInTheDocument();
        expect(screen.getByTestId('calls-widget-profile-self')).toBeInTheDocument();
        expect(screen.queryByTestId('calls-widget-profile-other')).not.toBeInTheDocument();
    });

    test('a ringing DM call renders the callee tile before the caller tile', () => {
        renderWidget([ownSession]);

        const tiles = screen.getAllByTestId(/^calls-widget-profile-(ringing|self|other)$/);

        expect(tiles.map((tile) => tile.dataset.testid)).toEqual([
            'calls-widget-profile-ringing',
            'calls-widget-profile-self',
        ]);
    });

    test('the ringing callee avatar pulses while the caller avatar does not', () => {
        renderWidget([ownSession]);

        expect(within(screen.getByTestId('calls-widget-profile-ringing')).getByAltText(/profile image/)).toHaveClass('pulsingAnimation');
        expect(within(screen.getByTestId('calls-widget-profile-self')).getByAltText(/profile image/)).not.toHaveClass('pulsingAnimation');
    });

    // By the time the callee is in the call the auto-unmute has long settled, so the badge can
    // report the caller's real state without blinking.
    test('an answered DM call shows the mute badge for a muted caller', () => {
        renderWidget([ownSession, calleeSession]);

        expect(within(screen.getByTestId('calls-widget-profile-self')).getByTestId('calls-widget-profile-mute-state')).toBeInTheDocument();
    });

    test('an answered DM call drops the mute badge once the caller unmutes', () => {
        renderWidget([{...ownSession, unmuted: true}, calleeSession]);

        expect(within(screen.getByTestId('calls-widget-profile-self')).queryByTestId('calls-widget-profile-mute-state')).not.toBeInTheDocument();
    });

    test('a ringing DM call keeps the callee tile when the caller turns their camera on', () => {
        renderWidget([stubSession('session-1', 'user-id', true)]);

        expect(screen.getByTestId('calls-widget-profile-ringing')).toBeInTheDocument();
        expect(screen.getByTestId('calls-widget-profile-self')).toBeInTheDocument();
    });

    test('an answered DM call replaces the placeholder with the callee tile', () => {
        renderWidget([ownSession, calleeSession]);

        expect(screen.queryByTestId('calls-widget-profile-ringing')).not.toBeInTheDocument();
        expect(screen.getByTestId('calls-widget-profile-other')).toBeInTheDocument();
        expect(screen.getByTestId('calls-widget-profile-self')).toBeInTheDocument();
    });

    test('a ringing DM call with video disabled keeps the audio-only header and renders no tiles', () => {
        renderWidget([ownSession], {enableVideo: false});

        expect(screen.getByText('Calling…')).toBeInTheDocument();
        expect(screen.getByText('First2 Last2')).toBeInTheDocument();
        expect(screen.queryByTestId(/^calls-widget-profile-/)).not.toBeInTheDocument();
    });
});
