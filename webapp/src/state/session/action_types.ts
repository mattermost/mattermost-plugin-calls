// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {pluginId} from 'src/manifest';

export const UN_INITIALIZED = `${pluginId}_un_initialized` as const;
export const SESSIONS_RECEIVED = `${pluginId}_sessions_received` as const;
export const USER_JOINED = `${pluginId}_user_joined` as const;
export const USERS_VOICE_ACTIVITY_CHANGED = `${pluginId}_users_voice_activity_changed` as const;
export const USER_MUTED = `${pluginId}_user_muted` as const;
export const USER_UNMUTED = `${pluginId}_user_unmuted` as const;
export const USER_RAISE_HAND = `${pluginId}_user_raise_hand` as const;
export const USER_LOWER_HAND = `${pluginId}_user_unraise_hand` as const;
export const USER_REACTED = `${pluginId}_user_reacted` as const;
export const USER_REACTED_TIMEOUT = `${pluginId}_user_reacted_timeout` as const;
export const USER_LEFT = `${pluginId}_user_left` as const;
export const CALL_ENDED = `${pluginId}_call_ended` as const;

