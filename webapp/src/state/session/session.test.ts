// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {UserSessionState} from '@mattermost/calls-common/lib/types';
import {GlobalState} from '@mattermost/types/store';
import {UserProfile} from '@mattermost/types/users';
import type CallClient from 'src/clients/call';

import {
    numProfilesInCallInChannel,
    numSessionsInCallInChannel,
    numUsersInCallInChannel,
    profilesInCallInChannel,
    profilesInCallInCurrentChannel,
    profilesInCurrentCall,
    profilesInCurrentCallMap,
    sessionForCurrentCall,
    sessionsForOtherUsersInCall,
    sessionsInCalls,
    sessionsInCurrentCall,
    sessionsInCurrentCallMap,
} from './selectors';

const session = (sessionID: string, userID: string) => ({session_id: sessionID, user_id: userID} as UserSessionState);

const u1 = {id: 'u1', username: 'one'} as UserProfile;
const u2 = {id: 'u2', username: 'two'} as UserProfile;

// u1 is connected from two clients, and u3's profile hasn't been fetched.
const sessions = {
    channelA: {
        s1: session('s1', 'u1'),
        s2: session('s2', 'u1'),
        s3: session('s3', 'u2'),
        s4: session('s4', 'u3'),
    },
    channelB: {
        s5: session('s5', 'u2'),
    },
};

const stateWith = ({callChannelID = 'channelA', currentChannelID = 'channelB'} = {}) => ({
    entities: {
        users: {
            currentUserId: 'u1',
            profiles: {u1, u2},
        },
        channels: {
            currentChannelId: currentChannelID,
        },
    },
    'plugins-com.mattermost.calls': {
        sessions,
        clientStateReducer: {channelID: callChannelID},
    },
} as unknown as GlobalState);

describe('session selectors', () => {
    afterEach(() => {
        delete window.callsClient;
    });

    test('sessionsInCalls returns the sessions of every call', () => {
        expect(sessionsInCalls(stateWith())).toBe(sessions);
    });

    test('sessionsInCurrentCall lists the sessions of the current call', () => {
        expect(sessionsInCurrentCall(stateWith())).toEqual(Object.values(sessions.channelA));
    });

    test('sessionsInCurrentCall is empty when not in a call', () => {
        expect(sessionsInCurrentCall(stateWith({callChannelID: ''}))).toEqual([]);
    });

    test('sessionsInCurrentCallMap returns the session map of the current call', () => {
        expect(sessionsInCurrentCallMap(stateWith())).toBe(sessions.channelA);
    });

    test('sessionsForOtherUsersInCall leaves out every session of the current user', () => {
        expect(sessionsForOtherUsersInCall(stateWith())).toEqual([sessions.channelA.s3, sessions.channelA.s4]);
    });

    test('sessionForCurrentCall returns the session of this client', () => {
        window.callsClient = {channelID: 'channelA', getSessionID: () => 's2'} as unknown as CallClient;

        expect(sessionForCurrentCall(stateWith({callChannelID: ''}))).toBe(sessions.channelA.s2);
    });

    test('sessionForCurrentCall is undefined when not in a call', () => {
        expect(sessionForCurrentCall(stateWith({callChannelID: ''}))).toBeUndefined();
    });

    test('profilesInCurrentCall lists each fetched profile once', () => {
        expect(profilesInCurrentCall(stateWith())).toEqual([u1, u2]);
    });

    test('profilesInCurrentCallMap maps user IDs to fetched profiles', () => {
        expect(profilesInCurrentCallMap(stateWith())).toEqual({u1, u2});
    });

    test('profilesInCurrentCallMap is empty when not in a call', () => {
        expect(profilesInCurrentCallMap(stateWith({callChannelID: ''}))).toEqual({});
    });

    test('profilesInCallInCurrentChannel uses the channel being viewed, not the current call', () => {
        expect(profilesInCallInCurrentChannel(stateWith())).toEqual([u2]);
    });

    test('profilesInCallInChannel lists the fetched profiles in the given channel', () => {
        expect(profilesInCallInChannel(stateWith(), 'channelA')).toEqual([u1, u2]);
        expect(profilesInCallInChannel(stateWith(), 'channelC')).toEqual([]);
    });

    test.each([
        ['channelA', 2, 4, 3],
        ['channelB', 1, 1, 1],
        ['channelC', 0, 0, 0],
    ])('in %s there are %s profiles, %s sessions and %s users', (channelID, numProfiles, numSessions, numUsers) => {
        const state = stateWith();

        expect(numProfilesInCallInChannel(state, channelID)).toBe(numProfiles);
        expect(numSessionsInCallInChannel(state, channelID)).toBe(numSessions);
        expect(numUsersInCallInChannel(state, channelID)).toBe(numUsers);
    });
});
