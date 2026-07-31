// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {UserSessionState} from '@mattermost/calls-common/lib/types';
import type {Channel} from '@mattermost/types/channels';
import type {Team} from '@mattermost/types/teams';
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
    callStartAt: Date.now() - 30_000,
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
