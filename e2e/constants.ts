// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {UserState} from './types';

// eslint-disable-next-line no-process-env
export const baseURL = process.env.MM_SITE_URL || 'http://localhost:8065';
export const defaultTeam = 'calls';
export const adminState: UserState = {
    username: 'sysadmin',
    password: 'Sys@dmin-sample1',
    storageStatePath: 'adminStorageState.json',
};
export const userPrefix = 'calls-user';

// FIPS servers require at least 14 characters.
export const userPassword = 'U$er-sample-pass1';
export const channelPrefix = 'calls';
export const pluginID = 'com.mattermost.calls';
