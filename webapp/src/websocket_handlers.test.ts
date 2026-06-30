// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {HostControlRemoved, UserRemovedData} from '@mattermost/calls-common/lib/types';
import {WebSocketMessage} from '@mattermost/client';
import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';
import {displayCallErrorModal, joinUser, leaveUser} from 'src/actions';
import {userLeftChannelErr, userRemovedFromChannelErr} from 'src/clients/calls';
import {HostRemovedYouFromCallErr} from 'src/components/error_modal/error_messages';

import {channelIDForCurrentCall} from './selectors';
import {getCallsClient, hasLiveCallClient} from './utils';
import {handleHostRemoved, handleUserJoined, handleUserLeft, handleUserRemovedFromChannel} from './websocket_handlers';

jest.mock('src/actions', () => ({
    displayCallErrorModal: jest.fn((err, channelID) => ({type: 'mock/displayCallErrorModal', err, channelID})),
    joinUser: jest.fn((channelID, userID, sessionID, isFromInitialSync) => ({type: 'mock/joinUser', channelID, userID, sessionID, isFromInitialSync})),
    leaveUser: jest.fn((channelID, userID, sessionID) => ({type: 'mock/leaveUser', channelID, userID, sessionID})),
}));
jest.mock('./selectors', () => ({
    channelIDForCurrentCall: jest.fn(),
    profilesInCurrentCallMap: jest.fn(() => ({})),
}));
jest.mock('./utils', () => ({
    getCallsClient: jest.fn(),
    getUserDisplayName: jest.fn(() => 'Test User'),
    hasLiveCallClient: jest.fn(),
}));
jest.mock('mattermost-redux/selectors/entities/users', () => ({
    ...jest.requireActual('mattermost-redux/selectors/entities/users'),
    getCurrentUserId: jest.fn(),
    getUser: jest.fn(() => null),
}));

const mockedGetCurrentUserId = getCurrentUserId as jest.Mock;
const mockedChannelIDForCurrentCall = channelIDForCurrentCall as jest.Mock;
const mockedGetCallsClient = getCallsClient as jest.Mock;
const mockedDisplayCallErrorModal = displayCallErrorModal as unknown as jest.Mock;
const mockedJoinUser = joinUser as unknown as jest.Mock;
const mockedLeaveUser = leaveUser as unknown as jest.Mock;
const mockedHasLiveCallClient = hasLiveCallClient as jest.Mock;

describe('websocket_handlers', () => {
    const makeStore = () => ({
        dispatch: jest.fn(),
        getState: jest.fn(() => ({})),
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('handleUserRemovedFromChannel', () => {
        const buildEvent = (data: Partial<UserRemovedData>) => ({
            data,
            broadcast: {channel_id: '', user_id: ''},
        }) as unknown as WebSocketMessage<UserRemovedData>;

        it('removed self from the current call: shows the "removed" error and disconnects once', () => {
            mockedGetCurrentUserId.mockReturnValue('me');
            mockedChannelIDForCurrentCall.mockReturnValue('call-channel');
            const disconnect = jest.fn();
            mockedGetCallsClient.mockReturnValue({disconnect});
            const store = makeStore();

            handleUserRemovedFromChannel(store as never, buildEvent({
                channel_id: 'call-channel',
                user_id: 'me',
                remover_id: 'admin',
            }));

            expect(mockedDisplayCallErrorModal).toHaveBeenCalledWith(userRemovedFromChannelErr, 'call-channel');
            expect(store.dispatch).toHaveBeenCalledWith(mockedDisplayCallErrorModal.mock.results[0].value);
            expect(disconnect).toHaveBeenCalledTimes(1);
        });

        it('left the current call channel yourself: shows the "left" error', () => {
            mockedGetCurrentUserId.mockReturnValue('me');
            mockedChannelIDForCurrentCall.mockReturnValue('call-channel');
            mockedGetCallsClient.mockReturnValue({disconnect: jest.fn()});
            const store = makeStore();

            handleUserRemovedFromChannel(store as never, buildEvent({
                channel_id: 'call-channel',
                user_id: 'me',
                remover_id: 'me',
            }));

            expect(mockedDisplayCallErrorModal).toHaveBeenCalledWith(userLeftChannelErr, 'call-channel');
        });

        it('another user removed: no modal, no disconnect', () => {
            mockedGetCurrentUserId.mockReturnValue('me');
            mockedChannelIDForCurrentCall.mockReturnValue('call-channel');
            const disconnect = jest.fn();
            mockedGetCallsClient.mockReturnValue({disconnect});
            const store = makeStore();

            handleUserRemovedFromChannel(store as never, buildEvent({
                channel_id: 'call-channel',
                user_id: 'someone-else',
                remover_id: 'admin',
            }));

            expect(mockedDisplayCallErrorModal).not.toHaveBeenCalled();
            expect(store.dispatch).not.toHaveBeenCalled();
            expect(disconnect).not.toHaveBeenCalled();
        });

        it('removed from a channel that is not the current call: no modal, no disconnect', () => {
            mockedGetCurrentUserId.mockReturnValue('me');
            mockedChannelIDForCurrentCall.mockReturnValue('call-channel');
            const disconnect = jest.fn();
            mockedGetCallsClient.mockReturnValue({disconnect});
            const store = makeStore();

            handleUserRemovedFromChannel(store as never, buildEvent({
                channel_id: 'other-channel',
                user_id: 'me',
                remover_id: 'admin',
            }));

            expect(mockedDisplayCallErrorModal).not.toHaveBeenCalled();
            expect(store.dispatch).not.toHaveBeenCalled();
            expect(disconnect).not.toHaveBeenCalled();
        });
    });

    // Regression coverage for MM-69189: the channel-wide join/leave broadcasts must keep
    // updating the call-post participant list in renderers that have no live LiveKit client
    // (e.g. Desktop's center channel). Only renderers fed by LiveKit — where hasLiveCallClient
    // is true — skip the broadcast. (hasLiveCallClient's own topology cases are covered in
    // utils.test.ts.)
    describe('handleUserJoined', () => {
        const buildEvent = (channelID: string) => ({
            data: {channelID, user_id: 'user-1', session_id: 'session-1'},
            broadcast: {channel_id: ''},
        }) as unknown as WebSocketMessage<never>;

        it('renderer owns the live LiveKit client: ignores the broadcast', () => {
            mockedHasLiveCallClient.mockReturnValue(true);
            const store = makeStore();

            handleUserJoined(store as never, buildEvent('call-channel'));

            expect(mockedJoinUser).not.toHaveBeenCalled();
            expect(store.dispatch).not.toHaveBeenCalled();
        });

        it('no live LiveKit client (e.g. Desktop center channel / observer): processes the broadcast', () => {
            mockedHasLiveCallClient.mockReturnValue(false);
            const store = makeStore();

            handleUserJoined(store as never, buildEvent('call-channel'));

            expect(mockedJoinUser).toHaveBeenCalledWith('call-channel', 'user-1', 'session-1', false);
            expect(store.dispatch).toHaveBeenCalledWith(mockedJoinUser.mock.results[0].value);
        });
    });

    describe('handleUserLeft', () => {
        const buildEvent = (channelID: string) => ({
            data: {channelID, user_id: 'user-1', session_id: 'session-1'},
            broadcast: {channel_id: ''},
        }) as unknown as WebSocketMessage<never>;

        it('renderer owns the live LiveKit client: ignores the broadcast', () => {
            mockedHasLiveCallClient.mockReturnValue(true);
            const store = makeStore();

            handleUserLeft(store as never, buildEvent('call-channel'));

            expect(mockedLeaveUser).not.toHaveBeenCalled();
            expect(store.dispatch).not.toHaveBeenCalled();
        });

        it('no live LiveKit client (e.g. Desktop center channel / observer): processes the broadcast', () => {
            mockedHasLiveCallClient.mockReturnValue(false);
            const store = makeStore();

            handleUserLeft(store as never, buildEvent('call-channel'));

            expect(mockedLeaveUser).toHaveBeenCalledWith('call-channel', 'user-1', 'session-1');
            expect(store.dispatch).toHaveBeenCalledWith(mockedLeaveUser.mock.results[0].value);
        });
    });

    describe('handleHostRemoved', () => {
        const buildEvent = (data: Partial<HostControlRemoved>) => ({
            data,
            broadcast: {channel_id: ''},
        }) as unknown as WebSocketMessage<HostControlRemoved>;

        it('host removed your session: shows the error and disconnects once', () => {
            const disconnect = jest.fn();
            mockedGetCallsClient.mockReturnValue({
                channelID: 'call-channel',
                getSessionID: () => 'my-session',
                disconnect,
            });
            const store = makeStore();

            handleHostRemoved(store as never, buildEvent({
                channel_id: 'call-channel',
                session_id: 'my-session',
                call_id: 'call-1',
                user_id: 'me',
            }));

            expect(mockedDisplayCallErrorModal).toHaveBeenCalledWith(HostRemovedYouFromCallErr, 'call-channel');
            expect(store.dispatch).toHaveBeenCalledWith(mockedDisplayCallErrorModal.mock.results[0].value);
            expect(disconnect).toHaveBeenCalledTimes(1);
        });

        it('event for a different channel than our client: no modal, no disconnect', () => {
            const disconnect = jest.fn();
            mockedGetCallsClient.mockReturnValue({
                channelID: 'call-channel',
                getSessionID: () => 'my-session',
                disconnect,
            });
            const store = makeStore();

            handleHostRemoved(store as never, buildEvent({
                channel_id: 'other-channel',
                session_id: 'my-session',
                call_id: 'call-1',
                user_id: 'me',
            }));

            expect(mockedDisplayCallErrorModal).not.toHaveBeenCalled();
            expect(store.dispatch).not.toHaveBeenCalled();
            expect(disconnect).not.toHaveBeenCalled();
        });

        it('no active calls client: no modal, no disconnect', () => {
            mockedGetCallsClient.mockReturnValue(null);
            const store = makeStore();

            handleHostRemoved(store as never, buildEvent({
                channel_id: 'call-channel',
                session_id: 'my-session',
                call_id: 'call-1',
                user_id: 'me',
            }));

            expect(mockedDisplayCallErrorModal).not.toHaveBeenCalled();
            expect(store.dispatch).not.toHaveBeenCalled();
        });
    });
});
