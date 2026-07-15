// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {test} from '@playwright/test';

import PlaywrightDevPage from '../page';
import {
    getChannelNamesForTest,
    getUsernamesForTest,
    getUserStoragesForTest,
    newUserPage,
    startCall,
} from '../utils';

const userStorages = getUserStoragesForTest();
const usernames = getUsernamesForTest();

test.setTimeout(400000);

test.beforeEach(async ({page}) => {
    const devPage = new PlaywrightDevPage(page);
    await devPage.goto();
});
test.afterEach(async ({page}) => {
    const devPage = new PlaywrightDevPage(page);
    await devPage.slashCallEnd();
});

test.describe('standalone widget indicators', {tag: '@livekit'}, () => {
    test.use({storageState: getUserStoragesForTest()[0]});

    test('mute indicator', async ({page}) => {
        // user0 starts the call via the normal webapp
        const user0Page = new PlaywrightDevPage(page);
        const [_, user1NormalPage] = await Promise.all([
            user0Page.startCall(),
            startCall(userStorages[1]),
        ]);

        // user2 joins via the standalone widget page
        const user2WidgetPage = await newUserPage(userStorages[2]);
        await user2WidgetPage.openWidget(getChannelNamesForTest()[0]);

        // user1 is muted by default; user2's widget should show them as muted
        await user2WidgetPage.expectMuted(usernames[1], true);

        // user1 unmutes (toggle); user2's widget should reflect that
        await user1NormalPage.unmute();
        await user2WidgetPage.expectMuted(usernames[1], false);

        // user1 mutes again (toggle); user2's widget should reflect that
        await user1NormalPage.unmute();
        await user2WidgetPage.expectMuted(usernames[1], true);

        await Promise.all([
            user0Page.leaveCall(),
            user1NormalPage.leaveCall(),
            user2WidgetPage.leaveFromWidget(),
        ]);
    });

    test('raised-hand indicator', async ({page}) => {
        // user0 starts the call
        const user0Page = new PlaywrightDevPage(page);
        const [_, user1NormalPage] = await Promise.all([
            user0Page.startCall(),
            startCall(userStorages[1]),
        ]);

        // user2 joins via standalone widget
        const user2WidgetPage = await newUserPage(userStorages[2]);
        await user2WidgetPage.openWidget(getChannelNamesForTest()[0]);

        // user1 raises hand; user2's standalone widget should show raised-hand indicator
        await user1NormalPage.raiseHand();
        await user2WidgetPage.expectRaisedHand(usernames[1]);

        // user1 lowers hand (toggle); user2's widget should clear indicator
        await user1NormalPage.raiseHand();
        await user2WidgetPage.expectUnRaisedHand(usernames[1]);

        await Promise.all([
            user0Page.leaveCall(),
            user1NormalPage.leaveCall(),
            user2WidgetPage.leaveFromWidget(),
        ]);
    });
});
