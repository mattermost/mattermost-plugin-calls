// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {pluginId} from 'src/manifest';

export const SESSION_CONNECTION_QUALITY_CHANGED = `${pluginId}_session_connection_quality_changed` as const;
export const LOCAL_SESSION_RECONNECTING = `${pluginId}_local_session_reconnecting` as const;
export const LOCAL_SESSION_RECONNECTED = `${pluginId}_local_session_reconnected` as const;
