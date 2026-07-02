// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {type Reaction, type UserSessionState} from '@mattermost/calls-common/lib/types';

import {
    SESSIONS_RECEIVED,
    USER_HAND_LOWERED,
    USER_HAND_RAISED,
    USER_JOINED,
    USER_LEFT,
    USER_MUTED,
    USER_REACTED,
    USER_REACTED_TIMEOUT,
    USER_UNMUTED,
    USERS_VOICE_ACTIVITY_CHANGED,
} from './action_types';
import {
    getSessionsMapFromSessions,
    sessionsReceived,
    userJoined,
    userLeft,
    userLoweredHand,
    userMuted,
    userRaisedHand,
    userReacted,
    userReactedTimeout,
    usersVoiceActivityChanged,
    userUnmuted,
} from './actions';

const reaction: Reaction = {
    user_id: 'user1',
    session_id: 'session1',
    emoji: {name: 'smile', unified: '1f604'},
    timestamp: 1000,
    displayName: 'User One',
};

describe('sessionsReceived', () => {
    test('builds the SESSIONS_RECEIVED action', () => {
        const sessions = {session1: {session_id: 'session1', user_id: 'user1'} as UserSessionState};
        expect(sessionsReceived('channel1', sessions)).toEqual({
            type: SESSIONS_RECEIVED,
            data: {channelID: 'channel1', sessions},
        });
    });
});

describe('userJoined', () => {
    test('builds the USER_JOINED action', () => {
        expect(userJoined('channel1', 'session1', 'user1', 'me')).toEqual({
            type: USER_JOINED,
            data: {channelID: 'channel1', session_id: 'session1', userID: 'user1', currentUserID: 'me'},
        });
    });
});

describe('usersVoiceActivityChanged', () => {
    test('builds the USERS_VOICE_ACTIVITY_CHANGED action', () => {
        expect(usersVoiceActivityChanged('channel1', ['session1'], ['user1'])).toEqual({
            type: USERS_VOICE_ACTIVITY_CHANGED,
            data: {channelID: 'channel1', session_ids: ['session1'], userIDs: ['user1']},
        });
    });
});

describe('userMuted', () => {
    test('builds the USER_MUTED action', () => {
        expect(userMuted('channel1', 'session1', 'user1')).toEqual({
            type: USER_MUTED,
            data: {channelID: 'channel1', session_id: 'session1', userID: 'user1'},
        });
    });
});

describe('userUnmuted', () => {
    test('builds the USER_UNMUTED action', () => {
        expect(userUnmuted('channel1', 'session1', 'user1')).toEqual({
            type: USER_UNMUTED,
            data: {channelID: 'channel1', session_id: 'session1', userID: 'user1'},
        });
    });
});

describe('userRaisedHand', () => {
    test('carries the raised-hand timestamp', () => {
        expect(userRaisedHand('channel1', 'session1', 'user1', 1234)).toEqual({
            type: USER_HAND_RAISED,
            data: {channelID: 'channel1', session_id: 'session1', userID: 'user1', raised_hand: 1234},
        });
    });
});

describe('userLoweredHand', () => {
    test('sets raised_hand to 0', () => {
        expect(userLoweredHand('channel1', 'session1', 'user1')).toEqual({
            type: USER_HAND_LOWERED,
            data: {channelID: 'channel1', session_id: 'session1', userID: 'user1', raised_hand: 0},
        });
    });
});

describe('userReacted', () => {
    test('builds the USER_REACTED action', () => {
        expect(userReacted('channel1', 'user1', 'session1', reaction)).toEqual({
            type: USER_REACTED,
            data: {channelID: 'channel1', userID: 'user1', session_id: 'session1', reaction},
        });
    });
});

describe('userReactedTimeout', () => {
    test('builds the USER_REACTED_TIMEOUT action', () => {
        expect(userReactedTimeout('channel1', 'user1', 'session1', reaction)).toEqual({
            type: USER_REACTED_TIMEOUT,
            data: {channelID: 'channel1', userID: 'user1', session_id: 'session1', reaction},
        });
    });
});

describe('userLeft', () => {
    test('builds the USER_LEFT action', () => {
        expect(userLeft('channel1', 'session1', 'user1')).toEqual({
            type: USER_LEFT,
            data: {channelID: 'channel1', userID: 'user1', session_id: 'session1'},
        });
    });
});

describe('getSessionsMapFromSessions', () => {
    test('keys sessions by their session_id', () => {
        const sessions = [
            {session_id: 'a', user_id: 'user1'},
            {session_id: 'b', user_id: 'user2'},
        ] as UserSessionState[];

        expect(getSessionsMapFromSessions(sessions)).toEqual({
            a: {session_id: 'a', user_id: 'user1'},
            b: {session_id: 'b', user_id: 'user2'},
        });
    });

    test('returns an empty map for no sessions', () => {
        expect(getSessionsMapFromSessions([])).toEqual({});
    });
});
