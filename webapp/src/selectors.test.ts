// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {UserSessionState} from '@mattermost/calls-common/lib/types';
import type {Channel} from '@mattermost/types/channels';
import type {GlobalState} from '@mattermost/types/store';
import type CallsClient from 'src/client';

import {
    callOwnerIDForCurrentCall,
    isCurrentDMCallInCallingState,
    isCurrentUserInSessionForCurrentCall,
    isCurrentUserOwnerOfCurrentCall,
    numUsersInCallInChannel,
    otherUserIDForCurrentDMCall,
} from './selectors';

const channelID = 'dm-channel-id';
const callID = 'call-id';
const currentUserID = 'current-user-id';
const otherUserID = 'other-user-id';

const dmChannel = {
    id: channelID,
    name: `${currentUserID}__${otherUserID}`,
    display_name: 'Other User',
    type: 'D',
} as Channel;

const gmChannel = {
    id: channelID,
    name: 'group-channel-name',
    display_name: 'Group Message',
    type: 'G',
} as Channel;

const openChannel = {
    id: channelID,
    name: 'town-square',
    display_name: 'Town Square',
    type: 'O',
} as Channel;

const stubSession = (sessionID: string, userID: string) => ({
    session_id: sessionID,
    user_id: userID,
    unmuted: false,
    raised_hand: 0,
} as UserSessionState);

const ownSession = stubSession('own-session', currentUserID);
const otherSession = stubSession('other-session', otherUserID);
const ownSecondSession = stubSession('own-second-session', currentUserID);

type StateOpts = {
    channel?: Channel | null;
    call?: {ID?: string; ownerID?: string} | null;
    sessions?: UserSessionState[] | null;
    clientStateChannelID?: string;
};

const stubState = ({
    channel = dmChannel,
    call = {ID: callID, ownerID: currentUserID},
    sessions = [ownSession],
    clientStateChannelID,
}: StateOpts = {}) => ({
    'plugins-com.mattermost.calls': {
        calls: call ? {[channelID]: {channelID, startAt: 0, threadID: '', ...call}} : {},
        sessions: sessions ? {[channelID]: Object.fromEntries(sessions.map((s) => [s.session_id, s]))} : {},
        clientStateReducer: clientStateChannelID ? {channelID: clientStateChannelID, sessionID: 'widget-session'} : null,
    },
    entities: {
        channels: {channels: channel ? {[channel.id]: channel} : {}},
        users: {currentUserId: currentUserID, profiles: {}},
    },
} as unknown as GlobalState);

// The selectors resolve the current call from the calls client, so tests have to look connected.
const connectTo = (connectedChannelID: string) => {
    window.callsClient = {
        channelID: connectedChannelID,
        getSessionID: () => ownSession.session_id,
    } as unknown as CallsClient;
};

beforeEach(() => connectTo(channelID));

afterEach(() => {
    delete window.callsClient;
});

describe('callOwnerIDForCurrentCall', () => {
    test('should return the owner of the call in the connected channel', () => {
        expect(callOwnerIDForCurrentCall(stubState({call: {ID: callID, ownerID: otherUserID}}))).toBe(otherUserID);
    });

    test('should return undefined when the connected channel has no call', () => {
        expect(callOwnerIDForCurrentCall(stubState({call: null}))).toBeUndefined();
    });

    test('should return undefined when not connected to a call', () => {
        delete window.callsClient;

        expect(callOwnerIDForCurrentCall(stubState())).toBeUndefined();
    });

    test('should fall back to the channel the desktop global widget reports', () => {
        // The Desktop app connects through the global widget, so this window has no calls client
        // of its own and only knows about the call through clientStateReducer.
        delete window.callsClient;

        expect(callOwnerIDForCurrentCall(stubState({clientStateChannelID: channelID}))).toBe(currentUserID);
    });
});

describe('isCurrentUserOwnerOfCurrentCall', () => {
    test('should be true when the current user started the call', () => {
        expect(isCurrentUserOwnerOfCurrentCall(stubState())).toBe(true);
    });

    test('should be false when someone else started the call', () => {
        expect(isCurrentUserOwnerOfCurrentCall(stubState({call: {ID: callID, ownerID: otherUserID}}))).toBe(false);
    });

    test('should be false when the connected channel has no call', () => {
        expect(isCurrentUserOwnerOfCurrentCall(stubState({call: null}))).toBe(false);
    });

    test('should be false before the call has an ID, even though the owner matches', () => {
        // A call state can exist without an ID before the server has confirmed the call.
        expect(isCurrentUserOwnerOfCurrentCall(stubState({call: {ownerID: currentUserID}}))).toBe(false);
    });

    test('should be false when not connected to a call', () => {
        delete window.callsClient;

        expect(isCurrentUserOwnerOfCurrentCall(stubState())).toBe(false);
    });
});

describe('isCurrentUserInSessionForCurrentCall', () => {
    test('should be true when the current user has a session in the call', () => {
        expect(isCurrentUserInSessionForCurrentCall(stubState({sessions: [otherSession, ownSession]}))).toBe(true);
    });

    test('should be true when the current user is connected from more than one client', () => {
        expect(isCurrentUserInSessionForCurrentCall(stubState({sessions: [ownSession, ownSecondSession]}))).toBe(true);
    });

    test('should be false when only other users have joined', () => {
        expect(isCurrentUserInSessionForCurrentCall(stubState({sessions: [otherSession]}))).toBe(false);
    });

    test('should be false when the call has no sessions', () => {
        expect(isCurrentUserInSessionForCurrentCall(stubState({sessions: []}))).toBe(false);
    });

    test('should be false when no sessions have been received for the channel', () => {
        expect(isCurrentUserInSessionForCurrentCall(stubState({sessions: null}))).toBe(false);
    });
});

describe('isCurrentDMCallInCallingState', () => {
    test('should be true when the caller has joined their own DM call and nobody has answered', () => {
        expect(isCurrentDMCallInCallingState(stubState({sessions: [ownSession]}))).toBe(true);
    });

    test('should be false once the other party answers by joining', () => {
        expect(isCurrentDMCallInCallingState(stubState({sessions: [ownSession, otherSession]}))).toBe(false);
    });

    test('should be false for the callee, who does not own the call', () => {
        expect(isCurrentDMCallInCallingState(stubState({
            call: {ID: callID, ownerID: otherUserID},
            sessions: [ownSession, otherSession],
        }))).toBe(false);
    });

    test('should be false when the caller owns the call but has not joined it yet', () => {
        expect(isCurrentDMCallInCallingState(stubState({sessions: []}))).toBe(false);
    });

    test('should be false when the connected channel has no call', () => {
        expect(isCurrentDMCallInCallingState(stubState({call: null}))).toBe(false);
    });

    test.each([
        ['a group message', gmChannel],
        ['a channel', openChannel],
    ])('should be false for %s call, which never rings', (_, channel) => {
        expect(isCurrentDMCallInCallingState(stubState({channel, sessions: [ownSession]}))).toBe(false);
    });

    test('should be false when the call channel is not in the store', () => {
        // A popout starts with an empty store, so the channel may not have loaded yet.
        expect(isCurrentDMCallInCallingState(stubState({channel: null}))).toBe(false);
    });
});

describe('otherUserIDForCurrentDMCall', () => {
    test.each([
        ['second', `${currentUserID}__${otherUserID}`],
        ['first', `${otherUserID}__${currentUserID}`],
    ])('should return the other user when they are named %s in the DM channel name', (_, name) => {
        const channel = {...dmChannel, name} as Channel;

        expect(otherUserIDForCurrentDMCall(stubState({channel}))).toBe(otherUserID);
    });

    test('should return an empty string when the call channel is not in the store', () => {
        expect(otherUserIDForCurrentDMCall(stubState({channel: null}))).toBe('');
    });

    test('should return an empty string when not connected to a call', () => {
        delete window.callsClient;

        expect(otherUserIDForCurrentDMCall(stubState())).toBe('');
    });

    test('should not check that the call channel is a DM', () => {
        // It only parses the channel name, so callers have to gate on
        // isCurrentDMCallInCallingState rather than trust this on its own.
        expect(otherUserIDForCurrentDMCall(stubState({channel: gmChannel}))).toBe(gmChannel.name);
    });
});

describe('numUsersInCallInChannel', () => {
    test('should count a user connected from several clients once', () => {
        const state = stubState({sessions: [ownSession, ownSecondSession]});

        expect(numUsersInCallInChannel(state, channelID)).toBe(1);
    });

    test('should count each user in the call', () => {
        const state = stubState({sessions: [ownSession, otherSession]});

        expect(numUsersInCallInChannel(state, channelID)).toBe(2);
    });

    test('should not need the user profiles to have been fetched', () => {
        const state = stubState({sessions: [otherSession]});

        expect(state.entities.users.profiles).toEqual({});
        expect(numUsersInCallInChannel(state, channelID)).toBe(1);
    });

    test('should return zero when there is no call in the channel', () => {
        expect(numUsersInCallInChannel(stubState({sessions: null}), channelID)).toBe(0);
    });
});
