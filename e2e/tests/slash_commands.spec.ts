// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// MM-68570: /call end on LiveKit hits the "you don't have permission" branch
// in webapp/src/slash_commands.tsx:146 because hostIDForCallInChannel in the
// Redux store doesn't yet reflect the current user as host when slashCallEnd
// runs right after startCall. The helper in page.ts handles both possible
// modals cleanly, but the call doesn't end because the host check fails
// client-side. Needs a host-state-ready signal — either a hydrated host
// before startCall returns, or an explicit wait in the test. Revisit with a
// dedicated helper change.

import {expect, test} from '@playwright/test';

import PlaywrightDevPage from '../page';
import {getUserIdxForTest, getUsernamesForTest, getUserStoragesForTest, joinCall} from '../utils';

const userStorages = getUserStoragesForTest();
const usernames = getUsernamesForTest();

test.beforeEach(async ({page}) => {
    const devPage = new PlaywrightDevPage(page);
    await devPage.goto();
});

test.describe('slash commands', {tag: '@livekit'}, () => {
    const userIdx = getUserIdxForTest();
    test.use({storageState: getUserStoragesForTest()[0]});

    test.fixme('end call', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.startCall();

        await expect(page.locator('#calls-widget')).toBeVisible();
        await expect(page.getByTestId('calls-widget-loading-overlay')).toBeHidden();

        await devPage.slashCallEnd();

        // /call end cleans up all indicators of a running call
        await expect(page.locator('#calls-widget')).toBeHidden();
        await expect(page.locator('#calls-channel-toast')).toBeHidden();
        await expect(page.locator(`#sidebarItem_calls${userIdx}`).getByTestId('calls-sidebar-active-call-icon')).toBeHidden();
    });

    test.fixme('end call as second host', async ({page}) => {
        const user0Page = new PlaywrightDevPage(page);

        // Here we are potentially introducing flakiness since the host is the first user to join
        // and through the Promise.all() call both users join in parallel.
        // That said, in one case (the second user) we have to spawn a new browser process,
        // so we are am assuming the first user will consistently beat that, guaranteeing the order.
        const [, user1Page] = await Promise.all([
            user0Page.startCall(),
            joinCall(userStorages[1]),
        ]);

        await expect(user0Page.page.locator('#calls-widget')).toBeVisible();
        await expect(user0Page.page.getByTestId('calls-widget-loading-overlay')).toBeHidden();

        await user0Page.sendSlashCommand(`/call host @${usernames[1]}`);
        await user0Page.wait(1000);
        await user0Page.expectHostToBe(usernames[1]);

        await user1Page.slashCallEnd();

        // /call end cleans up all indicators of a running call
        await expect(user0Page.page.locator('#calls-widget')).toBeHidden();
        await expect(user0Page.page.locator('#calls-channel-toast')).toBeHidden();
        await expect(user0Page.page.locator(`#sidebarItem_calls${userIdx}`).getByTestId('calls-sidebar-active-call-icon')).toBeHidden();
    });
});
