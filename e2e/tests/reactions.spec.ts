// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {test} from '@playwright/test';

import PlaywrightDevPage from '../page';
import {
    getUserStoragesForTest,
    joinCallAndPopout,
    startCallAndPopoutFromPage,
} from '../utils';

const userStorages = getUserStoragesForTest();

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

        // both popouts show a chip containing the emoji name (profile may not be loaded yet, so we
        // check the emoji rather than the sender's display name which can briefly show "Someone")
        await user0Popout.expectReactionChipOnPopout('+1');
        await user1Popout.expectReactionChipOnPopout('You');

        await Promise.all([user0Page.leaveCall(), user1Page.leaveCall()]);
    });

    test('reaction chip clears after timeout', async ({page}) => {
        const [user0Page, user0Popout] = await startCallAndPopoutFromPage(new PlaywrightDevPage(page));
        const [user1Page] = await joinCallAndPopout(userStorages[1]);

        // user0 sends a clap reaction; sender sees "You"
        await user0Popout.sendQuickReactionOnPopout('clap');
        await user0Popout.expectReactionChipOnPopout('You');

        // chip should disappear after the 10s timeout
        await user0Popout.expectReactionChipHiddenOnPopout('You');

        await Promise.all([user0Page.leaveCall(), user1Page.leaveCall()]);
    });

    test('multiple concurrent reactions', async ({page}) => {
        const [user0Page, user0Popout] = await startCallAndPopoutFromPage(new PlaywrightDevPage(page));
        const [user1Page, user1Popout] = await joinCallAndPopout(userStorages[1]);
        const [user2Page, user2Popout] = await joinCallAndPopout(userStorages[2]);

        // send reactions and watch for chips in one parallel block: chips live 10s so we can't
        // send sequentially then check — the first chip may expire while waiting for the second send.
        await Promise.all([
            user1Popout.sendQuickReactionOnPopout('+1'),
            user2Popout.sendQuickReactionOnPopout('tada'),
            user0Popout.expectReactionChipOnPopout('+1'),
            user0Popout.expectReactionChipOnPopout('tada'),
        ]);

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
