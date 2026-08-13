// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {UserSessionState} from '@mattermost/calls-common/lib/types';
import type {Channel} from '@mattermost/types/channels';
import type {Team} from '@mattermost/types/teams';
import type {UserProfile} from '@mattermost/types/users';
import {render, screen} from '@testing-library/react';
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
const stubState = (channel: Channel) => ({
    'plugins-com.mattermost.calls': {
        calls: {},
        sessions: {},
        dmCalleeAnsweredAt: {},
    },
    entities: {
        channels: {channels: {[channel.id]: channel}},
        users: {currentUserId: 'user-id', profiles: {}},
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
    connectedDMUser: undefined,
    isAdmin: false,
    isDMCalling: false,
};

describe('CallWidget', () => {
    const widget = (clientConnecting: boolean, global?: true) => (
        <Provider store={mockStore(stubState(stubChannel))}>
            <RawIntlProvider value={intl}>
                <CallWidget
                    {...props}
                    clientConnecting={clientConnecting}
                    global={global}
                />
            </RawIntlProvider>
        </Provider>
    );

    const renderWidget = (clientConnecting: boolean, global?: true) => render(
        widget(clientConnecting, global),
    );

    let originalCallsClient: typeof window.callsClient;
    let originalResizeObserver: typeof window.ResizeObserver;
    let disconnect: jest.Mock;
    let disconnectObserver: jest.Mock;
    let observe: jest.Mock;
    let openSpy: jest.SpyInstance;

    beforeEach(() => {
        originalCallsClient = window.callsClient;
        originalResizeObserver = window.ResizeObserver;
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

        observe = jest.fn();
        disconnectObserver = jest.fn();
        window.ResizeObserver = jest.fn().mockImplementation(() => ({
            observe,
            unobserve: jest.fn(),
            disconnect: disconnectObserver,
        })) as unknown as typeof ResizeObserver;
    });

    afterEach(() => {
        window.callsClient = originalCallsClient;
        window.ResizeObserver = originalResizeObserver;
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

    test('renders nothing while the client is still connecting', () => {
        const {container} = renderWidget(true);

        expect(container.querySelector('#calls-widget')).not.toBeInTheDocument();
    });

    test('renders once the client has connected', () => {
        const {container} = renderWidget(false);

        expect(container.querySelector('#calls-widget')).toBeInTheDocument();
    });

    test('attaches resize observers when the client finishes connecting', () => {
        const {container, rerender} = renderWidget(true, true);

        expect(window.ResizeObserver).not.toHaveBeenCalled();

        rerender(widget(false, true));

        const callWidget = container.querySelector('#calls-widget');
        expect(callWidget).toBeInTheDocument();
        expect(window.ResizeObserver).toHaveBeenCalledTimes(2);
        expect(observe).toHaveBeenCalledTimes(2);
        expect(observe).toHaveBeenCalledWith(callWidget);
        expect(observe).toHaveBeenCalledWith(callWidget?.firstElementChild);

        rerender(widget(true, true));

        expect(disconnectObserver).toHaveBeenCalledTimes(2);
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

    const dmChannel = {...stubChannel, type: 'D'} as Channel;
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

    const renderWidget = (channel: Channel, sessions: UserSessionState[]) => render(
        <Provider store={mockStore(dmState(sessions))}>
            <RawIntlProvider value={intl}>
                <CallWidget
                    {...props}
                    channel={channel}
                    channelDisplayName={channel.display_name}
                    sessions={sessions}
                    otherSessions={sessions.filter((s) => s.user_id !== 'user-id')}
                    profiles={{[calleeID]: callee}}
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
});
