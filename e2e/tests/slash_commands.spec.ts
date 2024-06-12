import {expect, test} from '@playwright/test';

import PlaywrightDevPage from '../page';
import {getUserIdxForTest, getUsernamesForTest, getUserStoragesForTest, joinCall, startCall} from '../utils';

const userStorages = getUserStoragesForTest();
const usernames = getUsernamesForTest();

test.beforeEach(async ({page}) => {
    const devPage = new PlaywrightDevPage(page);
    await devPage.goto();
});

test.describe('slash commands', () => {
    const userIdx = getUserIdxForTest();
    test.use({storageState: getUserStoragesForTest()[0]});

    test('end call', async ({page}) => {
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

    test('end call as second host', async () => {
        const user0Page = await startCall(userStorages[0]);
        const user1Page = await joinCall(userStorages[1]);

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
