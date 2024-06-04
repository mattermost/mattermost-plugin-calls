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
export const userPassword = 'U$er-sample1';
export const channelPrefix = 'calls';
export const pluginID = 'com.mattermost.calls';
