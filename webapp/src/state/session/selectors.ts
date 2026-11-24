// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {UserSessionState} from '@mattermost/calls-common/lib/types';
import {GlobalState} from '@mattermost/types/store';
import {UserProfile} from '@mattermost/types/users';
import {getCurrentChannelId} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';
import {createSelector} from 'reselect';
import {RootState} from 'src/reducers';
import {channelIDForCurrentCall, pluginReduxStore} from 'src/state/root_selectors';
import {getCallsClientSessionID} from 'src/utils';

export const sessionsInCalls = (state: GlobalState): RootState['sessions'] => {
    return pluginReduxStore(state).sessions;
};

const userProfiles = (state: GlobalState) => state.entities.users.profiles;

const getProfilesMapFromSessions = (sessions: Record<string, UserSessionState>, profiles: Record<string, UserProfile>) => {
    const profilesMap: Record<string, UserProfile> = {};
    for (const session of Object.values(sessions || {})) {
        if (profiles[session.user_id]) {
            profilesMap[session.user_id] = profiles[session.user_id];
        }
    }
    return profilesMap;
};

export const profilesInCurrentCall: (state: GlobalState) => UserProfile[] =
    createSelector(
        userProfiles,
        sessionsInCalls,
        channelIDForCurrentCall,
        (profiles, sessions, channelID) => {
            return Object.values(getProfilesMapFromSessions(sessions[channelID], profiles));
        },
    );

export const profilesInCallInCurrentChannel: (state: GlobalState) => UserProfile[] =
    createSelector(
        userProfiles,
        sessionsInCalls,
        getCurrentChannelId,
        (profiles, sessions, currChannelId) => {
            return Object.values(getProfilesMapFromSessions(sessions[currChannelId], profiles));
        },
    );

// profilesInCurrentCallMap creates an id->UserProfile object for the currently connected call.
export const profilesInCurrentCallMap: (state: GlobalState) => { [id: string]: UserProfile } =
    createSelector(
        userProfiles,
        sessionsInCalls,
        channelIDForCurrentCall,
        (profiles, sessions, channelID) => {
            return getProfilesMapFromSessions(sessions[channelID], profiles);
        },
    );

export const profilesInCallInChannel = (state: GlobalState, channelID: string): UserProfile[] => {
    return Object.values(getProfilesMapFromSessions(sessionsInCalls(state)[channelID], userProfiles(state)));
};

export const numProfilesInCallInChannel = (state: GlobalState, channelID: string): number => {
    return profilesInCallInChannel(state, channelID).length;
};

export const numSessionsInCallInChannel = (state: GlobalState, channelID: string): number => {
    return Object.keys(sessionsInCalls(state)[channelID] || {}).length;
};

// numUsersInCallInChannel counts the distinct users in the call rather than their sessions,
// since a single user can be connected from multiple clients. Unlike numProfilesInCallInChannel
// it doesn't need the profiles to have been fetched, so it never undercounts.
export const numUsersInCallInChannel = (state: GlobalState, channelID: string): number => {
    const sessions = sessionsInCalls(state)[channelID] || {};
    return new Set(Object.values(sessions).map((session) => session.user_id)).size;
};

export const sessionsInCurrentCall: (state: GlobalState) => UserSessionState[] =
    createSelector(
        sessionsInCalls,
        channelIDForCurrentCall,
        (sessions, channelID) => Object.values(sessions[channelID] || {}),
    );

export const sessionsForOtherUsersInCall: (state: GlobalState) => UserSessionState[] =
    createSelector(
        getCurrentUserId,
        sessionsInCurrentCall,
        (currentUserID, sessions) => sessions.filter((session) => session.user_id !== currentUserID),
    );

export const sessionsInCurrentCallMap: (state: GlobalState) => { [sessionID: string]: UserSessionState } =
    createSelector(
        sessionsInCalls,
        channelIDForCurrentCall,
        (sessions, channelID) => sessions[channelID],
    );

export const sessionForCurrentCall: (state: GlobalState) => UserSessionState =
    createSelector(
        sessionsInCalls,
        channelIDForCurrentCall,
        getCallsClientSessionID,
        (sessions, channelID, sessionID) => sessions[channelID]?.[sessionID],
    );
