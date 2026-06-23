// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {pluginId} from 'src/manifest';

export const UN_INITIALIZED = `${pluginId}_un_initialized` as const;
export const CALL_ENDED = `${pluginId}_call_ended` as const;