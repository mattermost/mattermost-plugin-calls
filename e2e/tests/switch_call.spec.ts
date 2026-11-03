// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {test} from '@playwright/test';

import {defaultTeam} from '../constants';
import CallsSession from '../lib/pages/calls_session';
import {getChannelNamesForTest, getUserStoragesForTest} from '../utils';

const [channelName, otherChannelName] = getChannelNamesForTest();

test.beforeEach(async ({page}) => {
    await new CallsSession(page).gotoChannel(defaultTeam, channelName);
});

test.describe('switch call', () => {
    test.use({storageState: getUserStoragesForTest()[0]});

    test('exit modal - cancel button', async ({page}) => {
        const user = new CallsSession(page);
        await user.startCall();

        await user.goToSidebarChannel(otherChannelName);

        await user.clickHeaderStartCall();
        await user.switchCallModal.toBeVisible();

        await user.switchCallModal.cancel();
        await user.switchCallModal.toBeHidden();

        await user.leaveCall();
    });

    test('exit modal - close icon', async ({page}) => {
        const user = new CallsSession(page);
        await user.startCall();

        await user.goToSidebarChannel(otherChannelName);

        await user.clickHeaderStartCall();
        await user.switchCallModal.toBeVisible();

        await user.switchCallModal.close();
        await user.switchCallModal.toBeHidden();

        await user.leaveCall();
    });

    test('exit modal - esc key', async ({page}) => {
        const user = new CallsSession(page);
        await user.startCall();

        await user.goToSidebarChannel(otherChannelName);

        await user.clickHeaderStartCall();
        await user.switchCallModal.toBeVisible();

        await user.switchCallModal.dismissWithEscape();
        await user.switchCallModal.toBeHidden();

        await user.leaveCall();
    });

    test('exit modal - click outside', async ({page}) => {
        const user = new CallsSession(page);
        await user.startCall();

        await user.goToSidebarChannel(otherChannelName);

        await user.clickHeaderStartCall();
        await user.switchCallModal.toBeVisible();

        await user.switchCallModal.dismissByClickingOutside();
        await user.switchCallModal.toBeHidden();

        await user.leaveCall();
    });

    test('join call', async ({page}) => {
        const user = new CallsSession(page);
        await user.startCall();

        await user.goToSidebarChannel(otherChannelName);

        await user.clickHeaderStartCall();
        await user.switchCallModal.toBeVisible();

        await user.switchCallModal.join();
        await user.switchCallModal.toBeHidden();

        await user.leaveCall();
    });
});
