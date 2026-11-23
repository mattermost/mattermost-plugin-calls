// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {UserSessionState} from '@mattermost/calls-common/lib/types';
import type {Channel} from '@mattermost/types/channels';
import type {Team} from '@mattermost/types/teams';
import type {UserProfile} from '@mattermost/types/users';
import {act, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {VideoTrack} from 'livekit-client';
import React from 'react';
import {createIntl, RawIntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {CALL_EVENT} from 'src/clients/call/constants';
import {CameraError, type DeviceStatus, type ScreenSharingSession} from 'src/clients/call/types';
import {AudioInputPermissionsErr} from 'src/components/error_modal/error_messages';
import {FakeCallClient, installFakeCallClient} from 'src/test_utils/fake_call_client';
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

        // Children render unconditionally (the real menu needs a click to open), plus a trigger
        // that reports the menu as open so tests can cover the menu-is-open state.
        default: ({children, onOpenChange}: {children: React.ReactNode; onOpenChange?: (open: boolean) => void}) => (
            <div>
                {/* eslint-disable-next-line formatjs/no-literal-string-in-jsx */}
                <button onClick={() => onOpenChange?.(true)}>{'open leave menu'}</button>
                {children}
            </div>
        ),
        DotMenuButton: 'div',
        DropdownMenu: 'div',
        DropdownMenuItem: ({children, onClick}: {children: React.ReactNode; onClick?: () => void}) => (
            <button onClick={onClick}>{children}</button>
        ),
        DropdownMenuSeparator: () => null,
    };
});

jest.mock('src/components/video_tile', () => ({
    __esModule: true,
    default: ({sessionID, size}: {sessionID: string; size: string}) => (
        <div
            data-testid='video-tile'
            data-session-id={sessionID}
            data-size={size}
        />
    ),
}));

const mockCamera = {deviceId: 'camera-1', label: 'FaceTime Camera', kind: 'videoinput'} as MediaDeviceInfo;
let mockCameras: MediaDeviceInfo[] = [mockCamera];

jest.mock('./use_video_input_devices', () => ({
    useVideoInputDevices: () => ({
        devices: mockCameras,
        selectedDeviceId: mockCamera.deviceId,
        selectDevice: jest.fn(),
    }),
}));

const intl = createIntl({locale: 'en', messages: {}});

const finishMediaAreaCollapse = () => fireEvent.transitionEnd(document.querySelector('.CallWidgetMediaArea__expander')!);

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
        phoneLegs: {},
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
    currentUserProfile: undefined,
    connectedDMUser: undefined,
    isAdmin: false,
    isDMCalling: false,
    isPhoneCall: false,
    isPhoneCallRinging: false,
    isPhoneCallActive: false,
    dmVideoEnabled: false,
    isCameraOn: false,
    isOtherCameraOn: false,
    currentSessionID: '',
};

describe('CallWidget', () => {
    let originalCallsClient: typeof window.callsClient;
    let disconnect: jest.Mock;
    let openSpy: jest.SpyInstance;

    beforeEach(() => {
        originalCallsClient = window.callsClient;
        disconnect = installFakeCallClient().disconnect;
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

describe('remote audio playback blocked banner', () => {
    let originalCallsClient: typeof window.callsClient;
    let client: FakeCallClient;

    const renderWidget = (canPlaybackAudio: boolean) => {
        client = installFakeCallClient();
        client.canPlaybackAudio = canPlaybackAudio;

        render(
            <Provider store={mockStore(stubState(stubChannel))}>
                <RawIntlProvider value={intl}>
                    <CallWidget {...props}/>
                </RawIntlProvider>
            </Provider>,
        );
    };

    const firePlaybackStatus = (canPlayback: boolean) => {
        act(() => {
            client.emit(canPlayback ? CALL_EVENT.REMOTE_AUDIO_PLAYBACK_UNBLOCKED : CALL_EVENT.REMOTE_AUDIO_PLAYBACK_BLOCKED);
        });
    };

    beforeEach(() => {
        originalCallsClient = window.callsClient;
    });

    afterEach(() => {
        window.callsClient = originalCallsClient;
    });

    test('is hidden while the browser allows playback', () => {
        renderWidget(true);

        expect(screen.queryByText(/your browser blocked call audio/i)).not.toBeInTheDocument();
    });

    test('shows on mount when playback is already blocked', () => {
        renderWidget(false);

        expect(screen.getByText(/your browser blocked call audio/i)).toBeInTheDocument();
    });

    test('shows when playback becomes blocked and hides once it is allowed again', () => {
        renderWidget(true);

        firePlaybackStatus(false);
        expect(screen.getByText(/your browser blocked call audio/i)).toBeInTheDocument();

        firePlaybackStatus(true);
        expect(screen.queryByText(/your browser blocked call audio/i)).not.toBeInTheDocument();
    });

    test('clicking the button starts audio straight from the click', async () => {
        const user = userEvent.setup();
        renderWidget(false);

        await user.click(screen.getByRole('button', {name: /enable audio/i}));

        expect(client.startAudio).toHaveBeenCalledTimes(1);
    });
});

describe('screen sharing in the media area', () => {
    const currentUserSession: UserSessionState = {session_id: 'session-1', user_id: 'user-id', unmuted: false, raised_hand: 0};
    const sharerSession: UserSessionState = {session_id: 'session-2', user_id: 'other-user', unmuted: false, raised_hand: 0};
    let client: FakeCallClient;

    const makeTrack = () => ({
        attach: jest.fn(),
        detach: jest.fn(),
        mediaStreamTrack: {getSettings: () => ({displaySurface: 'monitor'})},
    }) as unknown as VideoTrack & {attach: jest.Mock; detach: jest.Mock};
    const remoteShare = (track: VideoTrack | null): ScreenSharingSession => ({sessionID: sharerSession.session_id, userID: sharerSession.user_id, isLocal: false, track});
    const ownShare = (track: VideoTrack | null): ScreenSharingSession => ({sessionID: currentUserSession.session_id, userID: currentUserSession.user_id, isLocal: true, track});

    // Sets the share the client already has when the widget loads, without an event.
    const sharingOnLoad = (share: ScreenSharingSession) => {
        client.screenSharingSessionID = share.sessionID;
        client.localScreenTrack = share.isLocal ? share.track : null;
        client.remoteScreenTrack = share.isLocal ? null : share.track;
    };

    const widget = (overrides: Partial<Props> = {}) => (
        <Provider store={mockStore(stubState(stubChannel))}>
            <RawIntlProvider value={intl}>
                <CallWidget
                    {...props}
                    sessions={[currentUserSession, sharerSession]}
                    currentSession={currentUserSession}
                    currentSessionID={currentUserSession.session_id}
                    screenSharingSession={sharerSession}
                    profiles={{'other-user': {id: 'other-user', username: 'sharer'} as UserProfile}}
                    {...overrides}
                />
            </RawIntlProvider>
        </Provider>
    );

    const mediaArea = () => screen.queryByTestId('calls-widget-media-area');

    beforeEach(() => {
        client = installFakeCallClient();
        client.getSessionID.mockReturnValue(currentUserSession.session_id);
    });

    afterEach(() => {
        window.callsClient = undefined;
    });

    test('plays someone else\'s share inside the media area with a presenting bar and no Pop out', () => {
        const track = makeTrack();
        sharingOnLoad(remoteShare(track));
        render(widget());

        const player = mediaArea()?.querySelector('#screen-player');
        expect(player).toBeInstanceOf(HTMLVideoElement);
        expect(track.attach).toHaveBeenCalledWith(player);
        expect(screen.getByText('sharer is presenting')).toBeInTheDocument();
        expect(screen.queryByRole('button', {name: /pop out/i})).not.toBeInTheDocument();
        expect(screen.queryByRole('button', {name: 'Stop'})).not.toBeInTheDocument();
    });

    test('opens on the dark background while the remote track is still loading', () => {
        sharingOnLoad(remoteShare(null));
        render(widget());

        expect(mediaArea()).toBeInTheDocument();
        expect(document.querySelector('#screen-player')).toBeInTheDocument();
    });

    test('moves the screen player to the track a new screen sharing event brings', () => {
        const first = makeTrack();
        const second = makeTrack();
        sharingOnLoad(remoteShare(first));
        render(widget());
        const player = document.querySelector('#screen-player');

        act(() => client.setScreenShare(remoteShare(second)));

        expect(first.detach).toHaveBeenCalledWith(player);
        expect(second.attach).toHaveBeenCalledWith(player);
    });

    test('shows your own share when the widget loads mid-share, and Stop ends it', async () => {
        const user = userEvent.setup();
        const track = makeTrack();
        sharingOnLoad(ownShare(track));
        render(widget({screenSharingSession: currentUserSession}));

        expect(track.attach).toHaveBeenCalledWith(document.querySelector('#screen-player'));
        expect(screen.getByText('You are presenting your entire screen')).toBeInTheDocument();
        const stop = screen.getByTestId('calls-widget-stop-screenshare');
        expect(stop).toHaveAttribute('id', 'calls-widget-stop-screenshare');

        await user.click(stop);

        expect(client.unshareScreen).toHaveBeenCalledTimes(1);
    });

    test('a channel call has no media area until someone shares, and loses it when they stop', () => {
        render(widget({screenSharingSession: undefined}));
        expect(mediaArea()).not.toBeInTheDocument();

        act(() => client.setScreenShare(remoteShare(makeTrack())));
        expect(mediaArea()).toBeInTheDocument();

        act(() => client.setScreenShare(null));
        expect(mediaArea()).toBeInTheDocument();

        finishMediaAreaCollapse();
        expect(mediaArea()).not.toBeInTheDocument();
    });

    test.each([
        ['screen sharing is off', {allowScreenSharing: false}],
        ['it is a phone call', {isPhoneCall: true}],
    ])('shows no share when %s', (_, overrides: Partial<Props>) => {
        sharingOnLoad(remoteShare(makeTrack()));
        render(widget(overrides));

        expect(mediaArea()).not.toBeInTheDocument();
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

    // A real DM channel name, so getUserIdFromDM resolves the callee to the profile seeded in
    // stubState instead of one useDMCallingState would try to fetch.
    const dmChannel = {...stubChannel, type: 'D', name: 'user-id__other-user'} as Channel;
    const currentUserSession = stubSession('session-1', 'user-id');
    const otherSession = stubSession('session-2', 'other-user');

    beforeEach(() => {
        disconnect = installFakeCallClient().disconnect;
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

    test('keeps the menu while it is open and the last other participant leaves', async () => {
        const user = userEvent.setup();
        const widget = (sessions: UserSessionState[]) => (
            <Provider store={mockStore(stubState(stubChannel))}>
                <RawIntlProvider value={intl}>
                    <CallWidget
                        {...props}
                        sessions={sessions}
                        callHostID='user-id'
                        isAdmin={false}
                    />
                </RawIntlProvider>
            </Provider>
        );

        const {rerender} = render(widget([currentUserSession, otherSession]));

        await user.click(screen.getByRole('button', {name: /open leave menu/i}));

        // The other participant leaves, which on its own would drop this widget back to the
        // plain one-click leave button — unmounting the menu the user is in the middle of using.
        rerender(widget([currentUserSession]));

        const leaveMenuItem = screen.getByText('Leave call');
        expect(leaveMenuItem).toBeInTheDocument();

        await user.click(leaveMenuItem);
        expect(disconnect).toHaveBeenCalledTimes(1);
    });
});

describe('phone call', () => {
    // Phone calls live in the caller's DM with the Calls bot.
    const botDMChannel = {...stubChannel, type: 'D', name: 'user-id__calls-bot'} as Channel;
    const currentUserSession: UserSessionState = {session_id: 'session-1', user_id: 'user-id', unmuted: true, raised_hand: 0};

    const phoneState = (phone: Record<string, string>, sipState?: {status: string; answeredAt: number}) => {
        const state = stubState(botDMChannel);
        return {
            ...state,
            'plugins-com.mattermost.calls': {
                ...state['plugins-com.mattermost.calls'],
                calls: {
                    [botDMChannel.id]: {
                        ID: 'call-id',
                        channelID: botDMChannel.id,
                        startAt: 1000,
                        ownerID: 'user-id',
                        threadID: 'thread-id',
                        phone: {number: '+13125550174', displayNumber: '312-555-0174', label: 'DSN', targetUserID: '', ...phone},
                    },
                },
                phoneLegs: sipState ? {[botDMChannel.id]: sipState} : {},
            },
            entities: {
                ...state.entities,
                users: {
                    currentUserId: 'user-id',
                    profiles: {
                        'other-user': {id: 'other-user', username: 'leonard', first_name: 'Leonard', last_name: 'Riley'} as UserProfile,
                        'calls-bot': {id: 'calls-bot', username: 'calls', is_bot: true} as UserProfile,
                    },
                },
            },
        };
    };

    const widget = (state: ReturnType<typeof phoneState>, overrides: Partial<Props> = {}) => (
        <Provider store={mockStore(state)}>
            <RawIntlProvider value={intl}>
                <CallWidget
                    {...props}
                    channel={botDMChannel}
                    sessions={[currentUserSession]}
                    currentSession={currentUserSession}
                    isPhoneCall={true}
                    isPhoneCallRinging={true}
                    {...overrides}
                />
            </RawIntlProvider>
        </Provider>
    );

    const renderWidget = (state: ReturnType<typeof phoneState>, overrides: Partial<Props> = {}) => render(widget(state, overrides));

    let originalWebappUtils: typeof window.WebappUtils;
    let sendDTMF: FakeCallClient['sendDTMF'];

    beforeEach(() => {
        sendDTMF = installFakeCallClient().sendDTMF;

        // The settings menu reads window.WebappUtils, which the host webapp provides.
        originalWebappUtils = window.WebappUtils;
        window.WebappUtils = {} as typeof window.WebappUtils;
    });

    afterEach(() => {
        window.callsClient = undefined;
        window.WebappUtils = originalWebappUtils;
    });

    test('while ringing: shows who is being called with the number and label', () => {
        renderWidget(phoneState({targetUserID: 'other-user'}, {status: 'ringing', answeredAt: 0}));

        expect(screen.getByTestId('calls-widget-phone-call-title')).toHaveTextContent('Calling Leonard Riley…');
        expect(screen.getByTestId('calls-widget-phone-call-subtitle')).toHaveTextContent('312-555-0174 • DSN');
    });

    test('while ringing with no target user: shows the number as the name', () => {
        renderWidget(phoneState({}, {status: 'dialing', answeredAt: 0}));

        expect(screen.getByTestId('calls-widget-phone-call-title')).toHaveTextContent('Calling 312-555-0174…');
    });

    test('once answered: shows the name with the elapsed time and label', () => {
        renderWidget(
            phoneState({targetUserID: 'other-user'}, {status: 'active', answeredAt: Date.now() - 5000}),
            {isPhoneCallRinging: false},
        );

        expect(screen.getByTestId('calls-widget-phone-call-title')).toHaveTextContent(/^Leonard Riley$/);
        expect(screen.getByTestId('calls-widget-phone-call-subtitle')).toHaveTextContent(/00:0[4-6] • DSN/);
    });

    test('hides the pop-out, screen share and chat thread controls', async () => {
        const user = userEvent.setup();
        renderWidget(phoneState({targetUserID: 'other-user'}, {status: 'ringing', answeredAt: 0}));

        expect(screen.queryByRole('button', {name: /open in new window/i})).not.toBeInTheDocument();
        expect(screen.queryByRole('button', {name: /start presenting/i})).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', {name: /more options/i}));
        expect(screen.getByTestId('calls-widget-menu')).toBeInTheDocument();
        expect(screen.queryByText(/start presenting/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/show chat thread/i)).not.toBeInTheDocument();
    });

    test('hangs up with a single click', async () => {
        const user = userEvent.setup();
        renderWidget(phoneState({targetUserID: 'other-user'}, {status: 'active', answeredAt: 1000}), {isPhoneCallRinging: false});

        await user.click(screen.getByRole('button', {name: /^hang up$/i}));
        expect(window.callsClient?.disconnect).toHaveBeenCalledTimes(1);
    });

    describe('dial pad', () => {
        const ringingState = () => phoneState({targetUserID: 'other-user'}, {status: 'ringing', answeredAt: 0});
        const activeState = () => phoneState({targetUserID: 'other-user'}, {status: 'active', answeredAt: 1000});
        const active: Partial<Props> = {isPhoneCallRinging: false, isPhoneCallActive: true};

        const dialPadButton = () => screen.getByRole('button', {name: /^dial pad$/i});
        const digitsDisplay = () => screen.getByTestId('calls-widget-dial-pad-digits');

        test('is not offered on calls that are not phone calls', () => {
            renderWidget(activeState(), {...active, isPhoneCall: false});

            expect(screen.queryByRole('button', {name: /^dial pad$/i})).not.toBeInTheDocument();
        });

        test('is disabled until the phone answers', () => {
            const {rerender} = renderWidget(ringingState());
            expect(dialPadButton()).toBeDisabled();

            rerender(widget(activeState(), active));
            expect(dialPadButton()).toBeEnabled();
        });

        test('opens from its button, and closes from the button or the X', async () => {
            const user = userEvent.setup();
            renderWidget(activeState(), active);

            await user.click(dialPadButton());
            expect(screen.getByRole('group', {name: /^dial pad$/i})).toBeInTheDocument();
            expect(dialPadButton()).toHaveAttribute('aria-expanded', 'true');

            await user.click(dialPadButton());
            expect(screen.queryByRole('group', {name: /^dial pad$/i})).not.toBeInTheDocument();

            await user.click(dialPadButton());
            await user.click(screen.getByRole('button', {name: /close dial pad/i}));
            expect(screen.queryByRole('group', {name: /^dial pad$/i})).not.toBeInTheDocument();
        });

        test('sends each pressed digit and shows it', async () => {
            const user = userEvent.setup();
            renderWidget(activeState(), active);
            await user.click(dialPadButton());

            await user.click(screen.getByRole('button', {name: 'Dial pad 5'}));
            await user.keyboard('#');

            await waitFor(() => expect(digitsDisplay()).toHaveTextContent('5#'));
            expect(sendDTMF.mock.calls).toEqual([['5'], ['#']]);
        });

        test('shows an error and leaves the digit out when sending fails', async () => {
            const user = userEvent.setup();
            sendDTMF.mockRejectedValueOnce(new Error('data channel closed'));
            renderWidget(activeState(), active);
            await user.click(dialPadButton());

            await user.click(screen.getByRole('button', {name: 'Dial pad 1'}));

            expect(await screen.findByRole('alert')).toHaveTextContent('Couldn\'t send that digit');
            expect(digitsDisplay()).toHaveTextContent(/^$/);
            expect(screen.getByRole('group', {name: /^dial pad$/i})).toBeInTheDocument();

            await user.click(screen.getByRole('button', {name: 'Dial pad 2'}));

            await waitFor(() => expect(digitsDisplay()).toHaveTextContent('2'));
            expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        });

        test('clears a send error when closed and reopened', async () => {
            const user = userEvent.setup();
            sendDTMF.mockRejectedValueOnce(new Error('data channel closed'));
            renderWidget(activeState(), active);
            await user.click(dialPadButton());
            await user.click(screen.getByRole('button', {name: 'Dial pad 1'}));
            expect(await screen.findByRole('alert')).toBeInTheDocument();

            await user.click(screen.getByRole('button', {name: /close dial pad/i}));
            await user.click(dialPadButton());

            expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        });

        test('keeps the digits when closed and reopened', async () => {
            const user = userEvent.setup();
            renderWidget(activeState(), active);
            await user.click(dialPadButton());
            await user.click(screen.getByRole('button', {name: 'Dial pad 4'}));
            await waitFor(() => expect(digitsDisplay()).toHaveTextContent('4'));

            await user.click(screen.getByRole('button', {name: /close dial pad/i}));
            await user.click(dialPadButton());

            expect(digitsDisplay()).toHaveTextContent('4');
        });

        test('shows one of the dial pad and More options at a time', async () => {
            const user = userEvent.setup();
            renderWidget(activeState(), active);

            await user.click(dialPadButton());
            await user.click(screen.getByRole('button', {name: /more options/i}));
            expect(screen.getByTestId('calls-widget-menu')).toBeInTheDocument();
            expect(screen.queryByRole('group', {name: /^dial pad$/i})).not.toBeInTheDocument();

            await user.click(dialPadButton());
            expect(screen.getByRole('group', {name: /^dial pad$/i})).toBeInTheDocument();
            expect(screen.queryByTestId('calls-widget-menu')).not.toBeInTheDocument();
        });

        test('closes when the phone hangs up', async () => {
            const user = userEvent.setup();
            const {rerender} = renderWidget(activeState(), active);
            await user.click(dialPadButton());

            rerender(widget(phoneState({targetUserID: 'other-user'}, {status: 'hangup', answeredAt: 1000}), {isPhoneCallRinging: false}));

            expect(screen.queryByRole('group', {name: /^dial pad$/i})).not.toBeInTheDocument();
            expect(dialPadButton()).toBeDisabled();
        });
    });
});

describe('camera video and device controls', () => {
    const dmChannel = {...stubChannel, type: 'D', name: 'user-id__other-user'} as Channel;
    const selfSession: UserSessionState = {session_id: 'session-1', user_id: 'user-id', unmuted: true, raised_hand: 0};
    const otherSession: UserSessionState = {session_id: 'session-2', user_id: 'other-user', unmuted: true, raised_hand: 0};

    const defaultMic = {deviceId: 'default', label: 'Default - Built-in Microphone', kind: 'audioinput'} as MediaDeviceInfo;
    const builtInMic = {deviceId: 'built-in', label: 'Built-in Microphone', kind: 'audioinput'} as MediaDeviceInfo;
    const usbMic = {deviceId: 'usb', label: 'USB Microphone', kind: 'audioinput'} as MediaDeviceInfo;

    let client: FakeCallClient;

    const videoProps: Partial<Props> = {
        channel: dmChannel,
        dmVideoEnabled: true,
        sessions: [selfSession, otherSession],
        otherSessions: [otherSession],
        currentSession: selfSession,
        currentSessionID: selfSession.session_id,
    };

    const widget = (overrides: Partial<Props> = {}) => (
        <Provider store={mockStore(stubState(overrides.channel ?? dmChannel))}>
            <RawIntlProvider value={intl}>
                <CallWidget
                    {...props}
                    {...videoProps}
                    {...overrides}
                />
            </RawIntlProvider>
        </Provider>
    );

    const renderWidget = (overrides: Partial<Props> = {}) => render(widget(overrides));

    const bottomBarLabels = (container: HTMLElement) => {
        const bar = container.querySelector('.calls-widget-bottom-bar') as HTMLElement;
        return within(bar).getAllByRole('button').map((button) => button.getAttribute('aria-label'));
    };

    const fireDevices = (inputs: MediaDeviceInfo[]) => {
        act(() => {
            client.setAudioDevices({inputs, outputs: []});
        });
    };

    const checkedItems = (menuName: string) => {
        const items = within(screen.getByRole('menu', {name: menuName})).getAllByRole('menuitemradio');
        return items.filter((item) => item.getAttribute('aria-checked') === 'true').map((item) => item.textContent);
    };

    beforeEach(() => {
        mockCameras = [mockCamera];
        client = installFakeCallClient();
    });

    afterEach(() => {
        window.callsClient = undefined;
    });

    test('puts the camera right after the mic in a DM call with video', () => {
        const {container} = renderWidget();

        expect(bottomBarLabels(container)).toEqual([
            'Microphone',
            'Microphone options',
            'Camera',
            'Camera options',
            'Start presenting',
            'More options',
            'Leave call',
        ]);
    });

    test.each([
        ['DM video is turned off', {dmVideoEnabled: false}, true],
        ['the call is not in a DM', {channel: stubChannel}, true],
        ['it is a phone call', {isPhoneCall: true}, true],
        ['the client may not publish a camera', {}, false],
    ])('has no camera button when %s', (_, overrides: Partial<Props>, canPublish) => {
        client.canPublishCamera.mockReturnValue(canPublish);
        renderWidget(overrides);

        expect(screen.getByRole('button', {name: 'Microphone'})).toBeInTheDocument();
        expect(screen.queryByRole('button', {name: 'Camera'})).not.toBeInTheDocument();
    });

    test('while connecting, shows the camera from the settings alone', () => {
        client.canPublishCamera.mockReturnValue(false);
        renderWidget({clientConnecting: true});

        expect(screen.getByRole('button', {name: 'Camera'})).toBeDisabled();
    });

    test.each([
        [false, 'enableCamera'],
        [true, 'disableCamera'],
    ])('the camera button with the camera on=%p calls %s', async (isCameraOn, method) => {
        const user = userEvent.setup();
        renderWidget({isCameraOn});

        const camera = screen.getByRole('button', {name: 'Camera'});
        expect(camera).toHaveAttribute('aria-pressed', String(isCameraOn));

        await user.click(camera);
        expect(client[method as 'enableCamera' | 'disableCamera']).toHaveBeenCalledTimes(1);
    });

    const ringing: Partial<Props> = {isDMCalling: true, sessions: [selfSession], otherSessions: []};

    const videoTiles = () => within(screen.getByTestId('calls-widget-media-area')).queryAllByTestId('video-tile').map((tile) => [tile.dataset.sessionId, tile.dataset.size]);

    test('shows your own video large while ringing once the camera is on', () => {
        const {container, rerender} = renderWidget({...ringing, isCameraOn: false});
        const cameraOffLabels = bottomBarLabels(container);
        expect(screen.queryByTestId('calls-widget-media-area')).not.toBeInTheDocument();

        rerender(widget({...ringing, isCameraOn: true}));

        expect(bottomBarLabels(container)).toEqual(cameraOffLabels);
        expect(videoTiles()).toEqual([['session-1', 'large']]);
        expect(screen.getByRole('button', {name: 'Camera'})).toHaveAttribute('aria-pressed', 'true');
    });

    test('shows your own video before your session reaches the store', () => {
        renderWidget({...ringing, currentSession: undefined, isCameraOn: true});

        expect(videoTiles()).toEqual([['session-1', 'large']]);
    });

    test('moves your video to the corner when the other person answers', () => {
        const {rerender} = renderWidget({...ringing, isCameraOn: true});

        rerender(widget({isCameraOn: true}));

        expect(videoTiles()).toEqual([
            ['session-2', 'large'],
            ['session-1', 'small'],
        ]);
    });

    test.each([
        ['your camera', {isCameraOn: true}],
        ['the other person\'s camera', {isOtherCameraOn: true}],
    ])('once answered, shows the other person large and the self-view small when %s is on', (_, overrides: Partial<Props>) => {
        renderWidget(overrides);

        expect(videoTiles()).toEqual([
            ['session-2', 'large'],
            ['session-1', 'small'],
        ]);
    });

    test('closes the area once both cameras are off', () => {
        const {rerender} = renderWidget({isOtherCameraOn: true});
        expect(screen.getByTestId('calls-widget-media-area')).toBeInTheDocument();

        rerender(widget({isOtherCameraOn: false}));
        expect(videoTiles()).toEqual([
            ['session-2', 'large'],
            ['session-1', 'small'],
        ]);

        finishMediaAreaCollapse();
        expect(screen.queryByTestId('calls-widget-media-area')).not.toBeInTheDocument();
    });

    test('collapses your own video when you turn the camera off while ringing', () => {
        const {rerender} = renderWidget({...ringing, isCameraOn: true});

        rerender(widget({...ringing, isCameraOn: false}));
        expect(videoTiles()).toEqual([['session-1', 'large']]);

        finishMediaAreaCollapse();
        expect(screen.queryByTestId('calls-widget-media-area')).not.toBeInTheDocument();
    });

    test('a screen share replaces the camera tiles, which come back when it ends', () => {
        renderWidget({isCameraOn: true, isOtherCameraOn: true});

        act(() => client.setScreenShare({sessionID: 'session-2', userID: 'other-user', isLocal: false, track: null}));
        expect(videoTiles()).toEqual([]);
        expect(document.querySelector('#screen-player')).toBeInTheDocument();

        act(() => client.setScreenShare(null));
        expect(document.querySelector('#screen-player')).not.toBeInTheDocument();
        expect(videoTiles()).toEqual([
            ['session-2', 'large'],
            ['session-1', 'small'],
        ]);
    });

    test('keeps the same area when the content switches, so it does not grow again', () => {
        renderWidget({isCameraOn: true});
        const area = screen.getByTestId('calls-widget-media-area');

        act(() => client.setScreenShare({sessionID: 'session-2', userID: 'other-user', isLocal: false, track: null}));

        expect(screen.getByTestId('calls-widget-media-area')).toBe(area);
    });

    test.each([
        ['while ringing with the camera off', {...ringing, isCameraOn: false}],
        ['once answered with both cameras off', {}],
        ['while connecting', {clientConnecting: true, isCameraOn: true}],
        ['without DM video', {dmVideoEnabled: false, isCameraOn: true}],
    ])('has no media area %s', (_, overrides: Partial<Props>) => {
        renderWidget(overrides);

        expect(screen.queryByTestId('calls-widget-media-area')).not.toBeInTheDocument();
    });

    test.each([
        ['the system default when no device is chosen', null, defaultMic.label],
        ['the system default when the chosen device is "default"', {deviceId: 'default', label: 'Default - Built-in Microphone'}, defaultMic.label],
        ['the chosen device', usbMic, usbMic.label],
        ['the chosen device by label when its ID changed', {deviceId: 'stale-id', label: usbMic.label}, usbMic.label],
    ])('the mic menu ticks %s', async (_, current, expectedLabel) => {
        const user = userEvent.setup();
        client.currentAudioInputDevice = current as MediaDeviceInfo | null;
        renderWidget();
        fireDevices([defaultMic, builtInMic, usbMic]);

        await user.click(screen.getByRole('button', {name: 'Microphone options'}));

        expect(checkedItems('Microphone options')).toEqual([expectedLabel]);
    });

    test('picking a mic switches to it and moves the tick', async () => {
        const user = userEvent.setup();
        renderWidget();
        fireDevices([defaultMic, builtInMic, usbMic]);

        await user.click(screen.getByRole('button', {name: 'Microphone options'}));
        await user.click(screen.getByRole('menuitemradio', {name: usbMic.label}));

        expect(client.setAudioInputDevice).toHaveBeenCalledWith(usbMic);
        expect(screen.queryByRole('menu', {name: 'Microphone options'})).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', {name: 'Microphone options'}));
        expect(checkedItems('Microphone options')).toEqual([usbMic.label]);
    });

    test('keeps one of the device menus and More options open at a time', async () => {
        const user = userEvent.setup();
        renderWidget();
        fireDevices([defaultMic]);

        await user.click(screen.getByRole('button', {name: 'Microphone options'}));
        expect(screen.getByRole('menu', {name: 'Microphone options'})).toBeInTheDocument();

        await user.click(screen.getByRole('button', {name: 'More options'}));
        expect(screen.getByTestId('calls-widget-menu')).toBeInTheDocument();
        expect(screen.queryByRole('menu', {name: 'Microphone options'})).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', {name: 'Camera options'}));
        expect(screen.getByRole('menu', {name: 'Camera options'})).toBeInTheDocument();
        expect(screen.queryByTestId('calls-widget-menu')).not.toBeInTheDocument();
    });

    test('More options has no microphone row and no additional settings', async () => {
        const user = userEvent.setup();
        renderWidget({channel: stubChannel, otherSessions: []});
        fireDevices([defaultMic]);

        await user.click(screen.getByRole('button', {name: 'More options'}));

        const menu = screen.getByTestId('calls-widget-menu');
        expect(within(menu).queryByRole('menuitem', {name: 'Microphone'})).not.toBeInTheDocument();
        expect(within(menu).queryByText('Additional settings')).not.toBeInTheDocument();
    });

    test('the audio output submenu ticks the current speaker, switches on pick, and Escape still closes More options', async () => {
        const user = userEvent.setup();
        const speaker = {deviceId: 'speaker-1', label: 'Built-in Speakers', kind: 'audiooutput'} as MediaDeviceInfo;
        const headphones = {deviceId: 'speaker-2', label: 'Headphones', kind: 'audiooutput'} as MediaDeviceInfo;
        client.currentAudioOutputDevice = speaker;
        renderWidget();
        act(() => {
            client.setAudioDevices({inputs: [defaultMic], outputs: [speaker, headphones]});
        });

        await user.click(screen.getByRole('button', {name: 'More options'}));
        await user.click(document.getElementById('calls-widget-audiooutput-button')!);

        const menu = screen.getByRole('menu', {name: 'Audio output'});
        expect(menu).toHaveAttribute('id', 'calls-widget-audiooutputs-menu');
        expect(checkedItems('Audio output')).toEqual([speaker.label]);
        expect(screen.getByRole('menuitemradio', {name: speaker.label})).toHaveFocus();

        await user.keyboard('{Escape}');
        expect(screen.queryByRole('menu', {name: 'Audio output'})).not.toBeInTheDocument();
        expect(screen.queryByTestId('calls-widget-menu')).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', {name: 'More options'}));
        await user.click(document.getElementById('calls-widget-audiooutput-button')!);
        await user.click(screen.getByRole('menuitemradio', {name: headphones.label}));
        expect(client.setAudioOutputDevice).toHaveBeenCalledWith(headphones);
        expect(screen.queryByRole('menu', {name: 'Audio output'})).not.toBeInTheDocument();
    });

    test('raise hand moved from the bottom bar into More options in a group call', async () => {
        const user = userEvent.setup();
        const {container} = renderWidget({channel: stubChannel, otherSessions: []});

        expect(container.querySelector('.calls-widget-bottom-bar #raise-hand')).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', {name: 'More options'}));
        const menu = screen.getByTestId('calls-widget-menu');
        expect(within(menu).getByRole('menuitem', {name: 'Raise hand'})).toBeInTheDocument();

        await user.click(within(menu).getByRole('button', {name: 'Raise hand'}));

        expect(client.raiseHand).toHaveBeenCalledTimes(1);
        expect(screen.queryByTestId('calls-widget-menu')).not.toBeInTheDocument();
    });

    test('More options offers lower hand while the hand is raised', async () => {
        const user = userEvent.setup();
        renderWidget({channel: stubChannel, otherSessions: [], currentSession: {...selfSession, raised_hand: 1}});

        await user.click(screen.getByRole('button', {name: 'More options'}));
        await user.click(within(screen.getByTestId('calls-widget-menu')).getByRole('button', {name: 'Lower hand'}));

        expect(client.unraiseHand).toHaveBeenCalledTimes(1);
    });

    test('More options has no raise hand in a DM call', async () => {
        const user = userEvent.setup();
        renderWidget();

        await user.click(screen.getByRole('button', {name: 'More options'}));

        expect(within(screen.getByTestId('calls-widget-menu')).queryByRole('menuitem', {name: 'Raise hand'})).not.toBeInTheDocument();
    });

    test.each([
        [CameraError.PermissionDenied, 'Allow camera access to Mattermost to turn on your camera.'],
        [CameraError.NotFound, 'No camera found. Try plugging in a camera.'],
        [CameraError.DeviceInUse, 'Your camera is being used by another app.'],
        [CameraError.Disconnected, 'Your camera was disconnected.'],
        [CameraError.Other, 'Unable to turn on your camera.'],
    ])('a %s camera error shows a banner', (err, text) => {
        renderWidget();

        act(() => {
            client.emit(CALL_EVENT.CAMERA_ERROR, err);
        });

        expect(screen.getByText(text)).toBeInTheDocument();
    });

    test('only the newest camera error shows, and it clears once the camera turns on', () => {
        const {rerender} = renderWidget();

        act(() => {
            client.emit(CALL_EVENT.CAMERA_ERROR, CameraError.NotFound);
            client.emit(CALL_EVENT.CAMERA_ERROR, CameraError.DeviceInUse);
        });

        expect(screen.queryByText('No camera found. Try plugging in a camera.')).not.toBeInTheDocument();
        expect(screen.getByText('Your camera is being used by another app.')).toBeInTheDocument();

        rerender(widget({isCameraOn: true}));

        expect(screen.queryByText('Your camera is being used by another app.')).not.toBeInTheDocument();
    });

    describe('microphone and camera status', () => {
        const fire = (event: string, ...args: unknown[]) => act(() => {
            client.emit(event, ...args);
        });

        const deviceStatus = (name: 'Microphone' | 'Camera') => screen.getByRole('button', {name}).closest('.DeviceControl')?.getAttribute('data-status');
        const hasBadge = (name: 'Microphone' | 'Camera') => Boolean(screen.getByRole('button', {name}).closest('.DeviceControl')?.querySelector('.icon-close-circle'));
        const pressMuteShortcut = () => fireEvent.keyDown(document, {key: ' ', code: 'Space', ctrlKey: true, shiftKey: true});

        const deferredEnableCamera = () => {
            const resolvers: Array<() => void> = [];
            client.enableCamera.mockImplementation(() => new Promise<undefined>((resolve) => {
                resolvers.push(() => resolve(undefined));
            }));
            return resolvers;
        };

        const setMicStatus = (status: DeviceStatus) => act(() => client.setMicStatus(status));

        test('the mic follows the client\'s status, and ignores the button and shortcut while starting', async () => {
            const user = userEvent.setup();
            client.micStatus = 'starting';
            renderWidget();

            expect(deviceStatus('Microphone')).toBe('starting');
            expect(hasBadge('Microphone')).toBe(false);
            expect(screen.getByRole('button', {name: 'Microphone'})).toHaveAttribute('aria-disabled', 'true');

            await user.click(screen.getByRole('button', {name: 'Microphone'}));
            pressMuteShortcut();
            expect(client.mute).not.toHaveBeenCalled();
            expect(client.unmute).not.toHaveBeenCalled();

            setMicStatus('ready');
            expect(deviceStatus('Microphone')).toBe('ready');

            pressMuteShortcut();
            expect(client.mute).toHaveBeenCalledTimes(1);
        });

        test('a widget that mounts after the mic is set up starts ready', () => {
            renderWidget();

            expect(deviceStatus('Microphone')).toBe('ready');
        });

        test.each([
            ['blocked', 'No audio input permissions'],
            ['missing', 'No audio input devices'],
        ] as const)('the mic shows %s with a badge', async (status, tooltip) => {
            const user = userEvent.setup();
            renderWidget();

            setMicStatus(status);

            expect(deviceStatus('Microphone')).toBe(status);
            expect(hasBadge('Microphone')).toBe(true);
            await user.hover(screen.getByRole('button', {name: 'Microphone'}));
            expect(await screen.findByText(tooltip)).toBeInTheDocument();
        });

        test('a missing mic ignores the shortcut', () => {
            renderWidget();
            setMicStatus('missing');

            pressMuteShortcut();

            expect(client.mute).not.toHaveBeenCalled();
        });

        test.each([
            ['a denied permission', () => client.emit(CALL_EVENT.ERROR, AudioInputPermissionsErr), 'Allow microphone access to Mattermost.'],
            ['no inputs', () => client.setAudioDevices({inputs: [], outputs: []}), 'Unable to find a valid audio input device. Try plugging in an audio input device.'],
        ])('%s still shows its banner', (_, trigger, banner) => {
            renderWidget();

            act(trigger);

            expect(screen.getByText(banner)).toBeInTheDocument();
        });

        test('the camera is starting from the click until it turns on, and ignores clicks meanwhile', async () => {
            const user = userEvent.setup();
            const resolvers = deferredEnableCamera();
            const {rerender} = renderWidget({isCameraOn: false});

            await user.click(screen.getByRole('button', {name: 'Camera'}));
            expect(deviceStatus('Camera')).toBe('starting');
            expect(screen.getByRole('button', {name: 'Camera options'})).toBeDisabled();

            await user.click(screen.getByRole('button', {name: 'Camera'}));
            expect(client.enableCamera).toHaveBeenCalledTimes(1);

            rerender(widget({isCameraOn: true}));
            expect(deviceStatus('Camera')).toBe('ready');
            expect(screen.getByRole('button', {name: 'Camera'})).toHaveAttribute('aria-pressed', 'true');

            await act(async () => resolvers[0]());
            expect(deviceStatus('Camera')).toBe('ready');
        });

        test('the camera goes back to ready if turning it on ends without turning it on', async () => {
            const user = userEvent.setup();
            const resolvers = deferredEnableCamera();
            renderWidget({isCameraOn: false});

            await user.click(screen.getByRole('button', {name: 'Camera'}));
            await act(async () => resolvers[0]());

            expect(deviceStatus('Camera')).toBe('ready');
            expect(screen.getByRole('button', {name: 'Camera'})).toHaveAttribute('aria-pressed', 'false');
        });

        test.each([
            [CameraError.PermissionDenied, 'blocked', true],
            [CameraError.NotFound, 'missing', true],
            [CameraError.DeviceInUse, 'ready', false],
            [CameraError.Disconnected, 'ready', false],
            [CameraError.Other, 'ready', false],
        ])('a %s error while starting ends it as %s', async (err, status, badge) => {
            const user = userEvent.setup();
            mockCameras = [];
            deferredEnableCamera();
            renderWidget({isCameraOn: false});

            await user.click(screen.getByRole('button', {name: 'Camera'}));
            fire(CALL_EVENT.CAMERA_ERROR, err);

            expect(deviceStatus('Camera')).toBe(status);
            expect(hasBadge('Camera')).toBe(badge);
            expect(screen.getByRole('button', {name: 'Camera'})).toHaveAttribute('aria-disabled', 'false');
        });

        test('a missing camera shows ready again once a camera is plugged in', () => {
            mockCameras = [];
            renderWidget({isCameraOn: false});
            fire(CALL_EVENT.CAMERA_ERROR, CameraError.NotFound);
            expect(deviceStatus('Camera')).toBe('missing');

            mockCameras = [mockCamera];
            fireDevices([defaultMic]);

            expect(deviceStatus('Camera')).toBe('ready');
        });

        test('a blocked camera retries on click, and clears once the camera turns on', async () => {
            const user = userEvent.setup();
            const resolvers = deferredEnableCamera();
            const {rerender} = renderWidget({isCameraOn: false});
            fire(CALL_EVENT.CAMERA_ERROR, CameraError.PermissionDenied);
            expect(deviceStatus('Camera')).toBe('blocked');

            await user.click(screen.getByRole('button', {name: 'Camera'}));
            expect(client.enableCamera).toHaveBeenCalledTimes(1);
            expect(deviceStatus('Camera')).toBe('starting');

            rerender(widget({isCameraOn: true}));
            await act(async () => resolvers[0]());
            expect(deviceStatus('Camera')).toBe('ready');
            expect(hasBadge('Camera')).toBe(false);
        });

        test('a slow earlier attempt finishing does not end a newer attempt early', async () => {
            const user = userEvent.setup();
            const resolvers = deferredEnableCamera();
            renderWidget({isCameraOn: false});

            await user.click(screen.getByRole('button', {name: 'Camera'}));
            fire(CALL_EVENT.CAMERA_ERROR, CameraError.DeviceInUse);
            await user.click(screen.getByRole('button', {name: 'Camera'}));
            expect(deviceStatus('Camera')).toBe('starting');

            await act(async () => resolvers[0]());
            expect(deviceStatus('Camera')).toBe('starting');

            await act(async () => resolvers[1]());
            expect(deviceStatus('Camera')).toBe('ready');
        });

        test('turning the camera off is immediate and has no starting state', async () => {
            const user = userEvent.setup();
            renderWidget({isCameraOn: true});

            await user.click(screen.getByRole('button', {name: 'Camera'}));

            expect(client.disableCamera).toHaveBeenCalledTimes(1);
            expect(deviceStatus('Camera')).toBe('ready');
        });
    });
});
