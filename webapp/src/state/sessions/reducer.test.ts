// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {type Reaction, type UserSessionState} from '@mattermost/calls-common/lib/types';
import {callEnded, unInitialized} from 'src/state/common_actions';

import {
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
import {reducer} from './reducer';

type SessionsState = ReturnType<typeof reducer>;

const makeSession = (overrides: Partial<UserSessionState> = {}): UserSessionState => ({
    session_id: 'session1',
    user_id: 'user1',
    unmuted: false,
    raised_hand: 0,
    voice: false,
    video: false,
    ...overrides,
});

const makeReaction = (timestamp: number): Reaction => ({
    user_id: 'user1',
    session_id: 'session1',
    emoji: {name: 'smile', unified: '1f604'},
    timestamp,
    displayName: 'User One',
});

describe('sessions reducer', () => {
    test('returns the initial state for an unknown action', () => {
        const state: SessionsState = {channel1: {session1: makeSession()}};
        expect(reducer(state, {type: 'unhandled'} as never)).toBe(state);
    });

    test('defaults to an empty state', () => {
        expect(reducer(undefined, {type: 'unhandled'} as never)).toEqual({});
    });

    test('UN_INITIALIZED clears every channel', () => {
        const state: SessionsState = {channel1: {session1: makeSession()}};
        expect(reducer(state, unInitialized())).toEqual({});
    });

    test('SESSIONS_RECEIVED replaces the sessions map for the channel and keeps other channels', () => {
        const state: SessionsState = {channel2: {session2: makeSession({session_id: 'session2'})}};
        const sessions = {session1: makeSession()};
        expect(reducer(state, sessionsReceived('channel1', sessions))).toEqual({
            channel1: sessions,
            channel2: {session2: makeSession({session_id: 'session2'})},
        });
    });

    test('USER_JOINED adds a session with default flags', () => {
        const result = reducer({}, userJoined('channel1', 'session1', 'user1', 'me'));
        expect(result.channel1.session1).toEqual({
            session_id: 'session1',
            user_id: 'user1',
            unmuted: false,
            voice: false,
            video: false,
            raised_hand: 0,
        });
    });

    test('USER_JOINED merges into the channel without dropping existing sessions', () => {
        const state: SessionsState = {channel1: {session1: makeSession()}};
        const result = reducer(state, userJoined('channel1', 'session2', 'user2', 'me'));
        expect(Object.keys(result.channel1)).toEqual(['session1', 'session2']);
    });

    test('USERS_VOICE_ACTIVITY_CHANGED is a no-op when the channel is unknown', () => {
        const state: SessionsState = {channel1: {session1: makeSession()}};
        expect(reducer(state, usersVoiceActivityChanged('other', ['x'], ['y']))).toBe(state);
    });

    test('USERS_VOICE_ACTIVITY_CHANGED sets voice true for active speakers and false for everyone else', () => {
        const state: SessionsState = {
            channel1: {
                session1: makeSession({session_id: 'session1', voice: false}),
                session2: makeSession({session_id: 'session2', voice: true}),
            },
        };
        const result = reducer(state, usersVoiceActivityChanged('channel1', ['session1'], ['user1']));
        expect(result.channel1.session1.voice).toBe(true);
        expect(result.channel1.session2.voice).toBe(false);
    });

    test('USERS_VOICE_ACTIVITY_CHANGED returns the same state reference when no voice flag actually changes', () => {
        const state: SessionsState = {
            channel1: {
                session1: makeSession({session_id: 'session1', voice: true}),
                session2: makeSession({session_id: 'session2', voice: false}),
            },
        };
        expect(reducer(state, usersVoiceActivityChanged('channel1', ['session1'], ['user1']))).toBe(state);
    });

    test('USERS_VOICE_ACTIVITY_CHANGED reuses unchanged session object references', () => {
        const session2 = makeSession({session_id: 'session2', voice: false});
        const state: SessionsState = {
            channel1: {
                session1: makeSession({session_id: 'session1', voice: false}),
                session2,
            },
        };
        const result = reducer(state, usersVoiceActivityChanged('channel1', ['session1'], ['user1']));
        expect(result.channel1.session2).toBe(session2);
    });

    test('USER_MUTED sets unmuted to false', () => {
        const state: SessionsState = {channel1: {session1: makeSession({unmuted: true})}};
        expect(reducer(state, userMuted('channel1', 'session1', 'user1')).channel1.session1.unmuted).toBe(false);
    });

    test('USER_UNMUTED sets unmuted to true', () => {
        const state: SessionsState = {channel1: {session1: makeSession({unmuted: false})}};
        expect(reducer(state, userUnmuted('channel1', 'session1', 'user1')).channel1.session1.unmuted).toBe(true);
    });

    test('USER_MUTED / USER_UNMUTED are no-ops when the session is unknown', () => {
        const state: SessionsState = {channel1: {session1: makeSession()}};
        expect(reducer(state, userMuted('channel1', 'unknown', 'user1'))).toBe(state);
        expect(reducer(state, userUnmuted('channel2', 'session1', 'user1'))).toBe(state);
    });

    test('USER_HAND_RAISED stores the timestamp', () => {
        const state: SessionsState = {channel1: {session1: makeSession()}};
        expect(reducer(state, userRaisedHand('channel1', 'session1', 'user1', 555)).channel1.session1.raised_hand).toBe(555);
    });

    test('USER_HAND_LOWERED resets the timestamp to 0', () => {
        const state: SessionsState = {channel1: {session1: makeSession({raised_hand: 555})}};
        expect(reducer(state, userLoweredHand('channel1', 'session1', 'user1')).channel1.session1.raised_hand).toBe(0);
    });

    test('USER_HAND_RAISED / USER_HAND_LOWERED are no-ops when the session is unknown', () => {
        const state: SessionsState = {channel1: {session1: makeSession()}};
        expect(reducer(state, userRaisedHand('channel1', 'unknown', 'user1', 5))).toBe(state);
        expect(reducer(state, userLoweredHand('channel1', 'unknown', 'user1'))).toBe(state);
    });

    test('USER_REACTED stores the reaction on the session', () => {
        const state: SessionsState = {channel1: {session1: makeSession()}};
        const reaction = makeReaction(1000);
        expect(reducer(state, userReacted('channel1', 'user1', 'session1', reaction)).channel1.session1.reaction).toEqual(reaction);
    });

    test('USER_REACTED is a no-op when the session is unknown', () => {
        const state: SessionsState = {channel1: {session1: makeSession()}};
        expect(reducer(state, userReacted('channel1', 'user1', 'unknown', makeReaction(1000)))).toBe(state);
    });

    test('USER_REACTED_TIMEOUT clears the reaction when the timing-out reaction is still displayed', () => {
        const state: SessionsState = {channel1: {session1: makeSession({reaction: makeReaction(1000)})}};
        const result = reducer(state, userReactedTimeout('channel1', 'user1', 'session1', makeReaction(1000)));
        expect(result.channel1.session1.reaction).toBeUndefined();
    });

    test('USER_REACTED_TIMEOUT keeps the reaction when a newer reaction has replaced it', () => {
        const state: SessionsState = {channel1: {session1: makeSession({reaction: makeReaction(2000)})}};

        // The timeout fires for the older reaction (1000), but a newer one (2000) is showing.
        expect(reducer(state, userReactedTimeout('channel1', 'user1', 'session1', makeReaction(1000)))).toBe(state);
    });

    test('USER_REACTED_TIMEOUT is a no-op when there is no reaction', () => {
        const state: SessionsState = {channel1: {session1: makeSession()}};
        expect(reducer(state, userReactedTimeout('channel1', 'user1', 'session1', makeReaction(1000)))).toBe(state);
    });

    test('USER_LEFT removes the session and keeps the rest of the channel', () => {
        const state: SessionsState = {
            channel1: {
                session1: makeSession({session_id: 'session1'}),
                session2: makeSession({session_id: 'session2'}),
            },
        };
        const result = reducer(state, userLeft('channel1', 'session1', 'user1'));
        expect(Object.keys(result.channel1)).toEqual(['session2']);
    });

    test('USER_LEFT is a no-op when the session is unknown', () => {
        const state: SessionsState = {channel1: {session1: makeSession()}};
        expect(reducer(state, userLeft('channel1', 'unknown', 'user1'))).toBe(state);
    });

    test('USER_LEFT does not mutate the previous state', () => {
        const state: SessionsState = {channel1: {session1: makeSession(), session2: makeSession({session_id: 'session2'})}};
        reducer(state, userLeft('channel1', 'session1', 'user1'));
        expect(Object.keys(state.channel1)).toEqual(['session1', 'session2']);
    });

    test('CALL_ENDED removes the channel and leaves others untouched', () => {
        const state: SessionsState = {
            channel1: {session1: makeSession()},
            channel2: {session2: makeSession({session_id: 'session2'})},
        };
        expect(reducer(state, callEnded('channel1', 'call1'))).toEqual({
            channel2: {session2: makeSession({session_id: 'session2'})},
        });
    });

    test('CALL_ENDED does not mutate the previous state', () => {
        const state: SessionsState = {channel1: {session1: makeSession()}};
        reducer(state, callEnded('channel1', 'call1'));
        expect(state).toEqual({channel1: {session1: makeSession()}});
    });
});
