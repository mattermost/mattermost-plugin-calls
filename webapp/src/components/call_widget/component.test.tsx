// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Channel} from '@mattermost/types/channels';
import type {Team} from '@mattermost/types/teams';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {createIntl, RawIntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import type CallClient from 'src/clients/call';
import {mockStore} from 'src/testUtils';

import CallWidget from './component';

type Props = React.ComponentProps<typeof CallWidget>;

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
    connectedDMUser: undefined,
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
        } as unknown as CallClient;
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
            <Provider store={mockStore()}>
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
            <Provider store={mockStore()}>
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
            <Provider store={mockStore()}>
                <RawIntlProvider value={intl}>
                    <CallWidget {...props}/>
                </RawIntlProvider>
            </Provider>,
        );

        await user.click(screen.getByRole('button', {name: /^leave call$/i}));

        expect(disconnect).toHaveBeenCalledTimes(1);
    });
});
