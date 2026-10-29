// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {defaultTeam} from '../constants';
import {getChannelNamesForTest, newUserPage} from '../utils';
import CallsSession from './pages/calls_session';

// CallsSession equivalents of the utils.ts helpers for extra users. Browsers are created
// by utils.newUserPage exactly as before; only the page object on top is new.

export async function newUserSession(userState: string) {
    const userPage = await newUserPage(userState);
    return new CallsSession(userPage.page);
}

export async function joinCallAsNewUser(userState: string) {
    const session = await newUserSession(userState);
    await session.gotoChannel(defaultTeam, getChannelNamesForTest()[0]);
    await session.joinCall();
    return session;
}
