// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {test} from '@playwright/test';

import {defaultTeam} from '../constants';
import CallsSession from '../lib/pages/calls_session';
import {startCallAsNewUser} from '../lib/sessions';
import {getChannelNamesForTest, getUserStoragesForTest, wait} from '../utils';

const userStorages = getUserStoragesForTest();
const [channelName, otherChannelName] = getChannelNamesForTest();

test.beforeEach(async ({page}) => {
    await new CallsSession(page).gotoChannel(defaultTeam, channelName);
});

test.describe('channel toast', () => {
    test.use({storageState: userStorages[0]});

    test('dismissed and remains dismissed when leaving and returning to channel', async ({page}) => {
        const user0 = new CallsSession(page);
        const user1 = await startCallAsNewUser(userStorages[1]);

        await user0.scrollToLastPost();

        await user0.toast.toBeVisible();

        await user0.toast.dismiss();

        await user0.toast.toBeHidden();

        await user0.goToSidebarChannel(otherChannelName);
        await user0.toast.toBeHidden();

        await user0.goToSidebarChannel(channelName);
        await user0.toast.toBeHidden();

        await user1.leaveCall();
    });

    test('dismissed and reappears for next call while remaining in channel', async ({page}) => {
        const user0 = new CallsSession(page);
        const user1 = await startCallAsNewUser(userStorages[1]);

        await user0.scrollToLastPost();

        await user0.toast.toBeVisible();

        await user0.toast.dismiss();

        await user0.toast.toBeHidden();

        await user1.leaveCall();
        await user1.startCall();

        await user0.toast.toBeVisible();

        await user1.leaveCall();
    });

    test('does not reappear after leaving call (call ends)', async () => {
        const user0 = await startCallAsNewUser(userStorages[0]);

        await user0.toast.toBeHidden();

        await user0.leaveCall();

        await wait(3000);

        await user0.toast.toBeHidden();
    });
});
