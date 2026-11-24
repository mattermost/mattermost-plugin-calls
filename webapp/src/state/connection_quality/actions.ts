// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {UserSessionState} from '@mattermost/calls-common/lib/types';
import {Channel} from '@mattermost/types/channels';
import {CONNECTION_QUALITY} from 'src/clients/call/constants';
import {
    ActionCallEnded,
    ActionLocalSessionClose,
    ActionUnInitialized,
    ActionUserLeft,
} from 'src/state/session/actions';

import {LOCAL_SESSION_RECONNECTED, LOCAL_SESSION_RECONNECTING, SESSION_CONNECTION_QUALITY_CHANGED} from './action_types';

export const sessionConnectionQualityChanged = (channelID: Channel['id'], sessionID: UserSessionState['session_id'], quality: CONNECTION_QUALITY) => ({
    type: SESSION_CONNECTION_QUALITY_CHANGED,
    data: {
        channelID,
        session_id: sessionID,
        quality,
    },
});
export type ActionSessionConnectionQualityChanged = ReturnType<typeof sessionConnectionQualityChanged>

export const localSessionReconnecting = (channelID: Channel['id'], sessionID: UserSessionState['session_id']) => ({
    type: LOCAL_SESSION_RECONNECTING,
    data: {
        channelID,
        session_id: sessionID,
    },
});
export type ActionLocalSessionReconnecting = ReturnType<typeof localSessionReconnecting>

export const localSessionReconnected = (channelID: Channel['id'], sessionID: UserSessionState['session_id']) => ({
    type: LOCAL_SESSION_RECONNECTED,
    data: {
        channelID,
        session_id: sessionID,
    },
});
export type ActionLocalSessionReconnected = ReturnType<typeof localSessionReconnected>

export type Actions =
  | ActionUnInitialized
  | ActionUserLeft
  | ActionCallEnded
  | ActionLocalSessionClose
  | ActionSessionConnectionQualityChanged
  | ActionLocalSessionReconnecting
  | ActionLocalSessionReconnected;
