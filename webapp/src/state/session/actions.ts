// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {UserSessionState} from '@mattermost/calls-common/lib/types';
import {Channel} from '@mattermost/types/channels';
import {UserProfile} from '@mattermost/types/users';

import {
    CALL_ENDED,
    SESSIONS_RECEIVED,
    UN_INITIALIZED,
    USER_JOINED,
    USER_LEFT,
    USER_MUTED,
    USER_UNMUTED,
    USERS_VOICE_ACTIVITY_CHANGED,
} from './action_types';

export const unInitialized = () => ({
    type: UN_INITIALIZED,
});
export type ActionUnInitialized = ReturnType<typeof unInitialized>

export const sessionsReceived = (channelID: Channel['id'], sessions: {[session_id: string]: UserSessionState}) => ({
    type: SESSIONS_RECEIVED,
    data: {
        channelID,
        sessions,
    },
});
export type ActionSessionsReceived = ReturnType<typeof sessionsReceived>

export const userJoined = (channelID: Channel['id'], sessionID: string, userID: UserProfile['id'], currentUserID: UserProfile['id']) => ({
    type: USER_JOINED,
    data: {
        channelID,
        session_id: sessionID,
        userID,
        currentUserID,
    },
});
export type ActionUserJoined = ReturnType<typeof userJoined>

export const usersVoiceActivityChanged = (channelID: Channel['id'], sessionIDs: string[], userIDs: string[]) => ({
    type: USERS_VOICE_ACTIVITY_CHANGED,
    data: {
        channelID,
        session_ids: sessionIDs,
        userIDs,
    },
});
export type ActionUsersVoiceActivityChanged = ReturnType<typeof usersVoiceActivityChanged>

export const userMuted = (channelID: Channel['id'], sessionID: string, userID: string) => ({
    type: USER_MUTED,
    data: {
        channelID,
        session_id: sessionID,
        userID,
    },
});
export type ActionUserMuted = ReturnType<typeof userMuted>

export const userUnmuted = (channelID: Channel['id'], sessionID: string, userID: string) => ({
    type: USER_UNMUTED,
    data: {
        channelID,
        session_id: sessionID,
        userID,
    },
});
export type ActionUserUnmuted = ReturnType<typeof userUnmuted>

export const userLeft = (channelID: Channel['id'], sessionID: string, userID: UserProfile['id']) => ({
    type: USER_LEFT,
    data: {
        channelID,
        userID,
        session_id: sessionID,
    },
});
export type ActionUserLeft = ReturnType<typeof userLeft>

export const callEnded = (channelID: Channel['id'], callID: string) => ({
    type: CALL_ENDED,
    data: {
        channelID,
        callID,
    },
});
export type ActionCallEnded = ReturnType<typeof callEnded>

export type Actions =
  | ActionUnInitialized
  | ActionSessionsReceived
  | ActionUserJoined
  | ActionUsersVoiceActivityChanged
  | ActionUserMuted
  | ActionUserUnmuted
  | ActionUserLeft
  | ActionCallEnded

export function getSessionsMapFromSessions(sessions: UserSessionState[]): {[session_id: string]: UserSessionState} {
    return sessions.reduce((map: Record<string, UserSessionState>, session: UserSessionState) => {
        map[session.session_id] = session;
        return map;
    }, {});
}
