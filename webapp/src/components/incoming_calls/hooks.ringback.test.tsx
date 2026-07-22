// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {act, render} from '@testing-library/react';
import React from 'react';
import {useRingback} from './hooks';

// ── Action mocks ──────────────────────────────────────────────────────────────
const mockRingForCall = jest.fn(() => () => ({}));
const mockStopRingingForCall = jest.fn(() => () => ({}));

jest.mock('src/actions', () => ({
    ringForCall: (...args: unknown[]) => mockRingForCall(...args),
    stopRingingForCall: (...args: unknown[]) => mockStopRingingForCall(...args),
    dismissIncomingCallNotification: jest.fn(() => () => ({})),
    showSwitchCallModal: jest.fn(() => () => ({})),
}));

// ── Util mocks ────────────────────────────────────────────────────────────────
const mockDisconnect = jest.fn();

jest.mock('src/utils', () => ({
    getCallsClient: jest.fn(() => ({disconnect: mockDisconnect})),
    isDmGmChannel: jest.fn(),
    notificationsStopRinging: jest.fn(),
    getChannelURL: jest.fn(),
    isDesktopApp: jest.fn(),
    desktopGTE: jest.fn(),
    sendDesktopEvent: jest.fn(),
    shouldRenderDesktopWidget: jest.fn(),
    split: jest.fn(),
}));

jest.mock('src/webapp_globals', () => ({
    sendDesktopNotificationToMe: jest.fn(),
    notificationSounds: {ring: jest.fn(), stopRing: jest.fn()},
}));

// ── Selector mocks ────────────────────────────────────────────────────────────
const mockRingingEnabled = jest.fn();
const mockChannelIDForCurrentCall = jest.fn();
const mockIdForCurrentCall = jest.fn();
const mockCallOwnerIDForCallInChannel = jest.fn();
const mockSessionsForOtherUsersInCall = jest.fn();
const mockSessionsInCurrentCall = jest.fn();

jest.mock('src/selectors', () => ({
    ringingEnabled: (...args: unknown[]) => mockRingingEnabled(...args),
    channelIDForCurrentCall: (...args: unknown[]) => mockChannelIDForCurrentCall(...args),
    idForCurrentCall: (...args: unknown[]) => mockIdForCurrentCall(...args),
    callOwnerIDForCallInChannel: (...args: unknown[]) => mockCallOwnerIDForCallInChannel(...args),
    sessionsForOtherUsersInCall: (...args: unknown[]) => mockSessionsForOtherUsersInCall(...args),
    sessionsInCurrentCall: (...args: unknown[]) => mockSessionsInCurrentCall(...args),
    ringingForCall: jest.fn(() => false),
    currentlyRinging: jest.fn(() => false),
    didNotifyForCall: jest.fn(() => false),
    didRingForCall: jest.fn(() => false),
    getStatusForCurrentUser: jest.fn(),
    teamForCurrentCall: jest.fn(),
    sortedIncomingCalls: jest.fn(() => []),
}));

const mockGetCurrentUser = jest.fn();
jest.mock('mattermost-redux/selectors/entities/users', () => ({
    getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
    getUser: jest.fn(),
    makeGetProfilesInChannel: jest.fn(() => jest.fn(() => [])),
    getCurrentUserId: jest.fn(() => 'user-1'),
}));

const mockGetChannel = jest.fn();
jest.mock('mattermost-redux/selectors/entities/channels', () => ({
    getChannel: (...args: unknown[]) => mockGetChannel(...args),
    getMyChannelMember: jest.fn(),
}));

jest.mock('mattermost-redux/actions/users', () => ({
    getProfilesInChannel: jest.fn(() => () => ({})),
}));

jest.mock('mattermost-redux/selectors/entities/general', () => ({
    getServerVersion: jest.fn(() => ''),
}));

jest.mock('mattermost-redux/selectors/entities/preferences', () => ({
    getTeammateNameDisplaySetting: jest.fn(),
}));

jest.mock('mattermost-redux/selectors/entities/teams', () => ({
    getMyTeams: jest.fn(() => []),
}));

jest.mock('mattermost-redux/utils/channel_utils', () => ({
    isChannelMuted: jest.fn(() => false),
}));

jest.mock('mattermost-redux/utils/helpers', () => ({
    isMinimumServerVersion: jest.fn(() => false),
    createIdsSelector: jest.fn(),
}));

jest.mock('mattermost-redux/utils/user_utils', () => ({
    displayUsername: jest.fn(),
}));

jest.mock('src/browser_routing', () => ({
    navigateToURL: jest.fn(),
}));

jest.mock('src/log', () => ({
    logDebug: jest.fn(),
    logWarn: jest.fn(),
    logErr: jest.fn(),
}));

// Mock useSelector to directly call the selector with a dummy state, and
// useDispatch to return a real thunk-aware dispatch. This lets tests control
// selector return values without depending on Redux store subscription timing.
const mockDispatch = jest.fn((action: unknown) => {
    if (typeof action === 'function') {
        return action(mockDispatch, () => ({}));
    }
    return action;
});

jest.mock('react-redux', () => ({
    ...jest.requireActual('react-redux'),
    useSelector: (selector: (state: unknown) => unknown) => selector({}),
    useDispatch: () => mockDispatch,
}));

// ── Test harness ──────────────────────────────────────────────────────────────

// A render-nothing component that mounts the hook — same pattern as RingbackContainer.
const RingbackHarness = () => {
    useRingback();
    return null;
};

const dmChannel = {id: 'ch1', type: 'D'};
const currentUser = {id: 'user-1', notify_props: {}};

function setupDefaults() {
    mockRingingEnabled.mockReturnValue(true);
    mockChannelIDForCurrentCall.mockReturnValue('ch1');
    mockIdForCurrentCall.mockReturnValue('call-1');
    mockCallOwnerIDForCallInChannel.mockReturnValue('user-1');
    mockGetCurrentUser.mockReturnValue(currentUser);
    mockGetChannel.mockReturnValue(dmChannel);
    mockSessionsInCurrentCall.mockReturnValue([{user_id: 'user-1', session_id: 'sess-1'}]);
    mockSessionsForOtherUsersInCall.mockReturnValue([]);
    const {isDmGmChannel} = jest.requireMock('src/utils');
    isDmGmChannel.mockReturnValue(true);
}

function renderHarness() {
    return render(<RingbackHarness/>);
}

function rerender(result: ReturnType<typeof renderHarness>) {
    act(() => {
        result.rerender(<RingbackHarness/>);
    });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useRingback', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        setupDefaults();
    });

    it('starts ringback when caller is alone in a DM call', () => {
        renderHarness();

        expect(mockRingForCall).toHaveBeenCalledTimes(1);
        expect(mockRingForCall).toHaveBeenCalledWith('call-1', expect.any(String));
    });

    it('does not start ringback when ringing is disabled', () => {
        mockRingingEnabled.mockReturnValue(false);
        renderHarness();

        expect(mockRingForCall).not.toHaveBeenCalled();
    });

    it('does not start ringback when user is not the call owner', () => {
        mockCallOwnerIDForCallInChannel.mockReturnValue('other-user');
        renderHarness();

        expect(mockRingForCall).not.toHaveBeenCalled();
    });

    it('does not start ringback in a non-DM/GM channel', () => {
        const {isDmGmChannel} = jest.requireMock('src/utils');
        isDmGmChannel.mockReturnValue(false);
        renderHarness();

        expect(mockRingForCall).not.toHaveBeenCalled();
    });

    it('does not start ringback when own session is not yet present', () => {
        mockSessionsInCurrentCall.mockReturnValue([]);
        renderHarness();

        expect(mockRingForCall).not.toHaveBeenCalled();
    });

    it('stops ringback when another user joins', () => {
        const result = renderHarness();
        expect(mockRingForCall).toHaveBeenCalledTimes(1);

        mockSessionsForOtherUsersInCall.mockReturnValue([{user_id: 'user-2', session_id: 'sess-2'}]);
        rerender(result);

        expect(mockStopRingingForCall).toHaveBeenCalledWith('call-1');
    });

    it('stops ringback on unmount', () => {
        const {unmount} = renderHarness();
        expect(mockRingForCall).toHaveBeenCalledTimes(1);

        unmount();

        expect(mockStopRingingForCall).toHaveBeenCalledWith('call-1');
    });

    it('stops ringback and disconnects after timeout', () => {
        jest.useFakeTimers();
        renderHarness();
        expect(mockRingForCall).toHaveBeenCalledTimes(1);

        act(() => {
            jest.runAllTimers();
        });

        expect(mockStopRingingForCall).toHaveBeenCalledWith('call-1');
        expect(mockDisconnect).toHaveBeenCalledTimes(1);
        jest.useRealTimers();
    });

    it('does not disconnect if ringback was already stopped before timeout fires', () => {
        jest.useFakeTimers();
        const {unmount} = renderHarness();

        // Unmount stops the ringback before the timer fires.
        unmount();

        act(() => {
            jest.runAllTimers();
        });

        expect(mockDisconnect).not.toHaveBeenCalled();
        jest.useRealTimers();
    });

    it('does not ring again after another user answers and then leaves', () => {
        const result = renderHarness();
        expect(mockRingForCall).toHaveBeenCalledTimes(1);

        // Another user joins — ringback stops, call marked as handled.
        mockSessionsForOtherUsersInCall.mockReturnValue([{user_id: 'user-2', session_id: 'sess-2'}]);
        rerender(result);
        expect(mockStopRingingForCall).toHaveBeenCalledWith('call-1');

        // Other user leaves — we are alone again, but ringback must NOT restart.
        mockSessionsForOtherUsersInCall.mockReturnValue([]);
        rerender(result);

        expect(mockRingForCall).toHaveBeenCalledTimes(1);
    });
});
