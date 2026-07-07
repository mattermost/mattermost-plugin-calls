// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {test} from '@playwright/test';

import PlaywrightDevPage from '../page';
import {
    getUsernamesForTest,
    getUserStoragesForTest,
    joinCallAndPopout,
    startCallAndPopoutFromPage,
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

test.describe('reactions', {tag: '@livekit'}, () => {
    test.use({storageState: getUserStoragesForTest()[0]});

    test('quick select reaction visible to all', async ({page}) => {
        const [user0Page, user0Popout] = await startCallAndPopoutFromPage(new PlaywrightDevPage(page));
        const [user1Page, user1Popout] = await joinCallAndPopout(userStorages[1]);

        // user1 sends a thumbs-up reaction from the popout emoji bar
        await user1Popout.sendQuickReactionOnPopout('+1');

        // both user0's popout and user1's own popout show the reaction chip
        await user0Popout.expectReactionChipOnPopout(usernames[1]);
        await user1Popout.expectReactionChipOnPopout(usernames[1]);

        await Promise.all([user0Page.leaveCall(), user1Page.leaveCall()]);
    });

    test('reaction chip clears after timeout', async ({page}) => {
        const [user0Page, user0Popout] = await startCallAndPopoutFromPage(new PlaywrightDevPage(page));
        const [user1Page, user1Popout] = await joinCallAndPopout(userStorages[1]);

        // user0 sends a clap reaction
        await user0Popout.sendQuickReactionOnPopout('clap');

        // chip is visible
        await user1Popout.expectReactionChipOnPopout(usernames[0]);

        // chip should disappear after the 10s timeout
        await user1Popout.expectReactionChipHiddenOnPopout(usernames[0]);

        await Promise.all([user0Page.leaveCall(), user1Page.leaveCall()]);
    });

    test('multiple concurrent reactions', async ({page}) => {
        const [user0Page, user0Popout] = await startCallAndPopoutFromPage(new PlaywrightDevPage(page));
        const [user1Page, user1Popout] = await joinCallAndPopout(userStorages[1]);
        const [user2Page, user2Popout] = await joinCallAndPopout(userStorages[2]);

        // user1 sends thumbs-up, user2 sends tada
        await user1Popout.sendQuickReactionOnPopout('+1');
        await user2Popout.sendQuickReactionOnPopout('tada');

        // user0 sees both reaction chips
        await user0Popout.expectReactionChipOnPopout(usernames[1]);
        await user0Popout.expectReactionChipOnPopout(usernames[2]);

        await Promise.all([user0Page.leaveCall(), user1Page.leaveCall(), user2Page.leaveCall()]);
    });

    test('own reaction shows as "You"', async ({page}) => {
        const [user0Page, user0Popout] = await startCallAndPopoutFromPage(new PlaywrightDevPage(page));
        const [user1Page] = await joinCallAndPopout(userStorages[1]);

        // user0 sends a heart reaction; own chip shows "You"
        await user0Popout.sendQuickReactionOnPopout('heart');
        await user0Popout.expectReactionChipOnPopout('You');

        await Promise.all([user0Page.leaveCall(), user1Page.leaveCall()]);
    });
});
