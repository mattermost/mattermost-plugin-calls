import {expect, test} from '@playwright/test';

import PlaywrightDevPage from '../page';
import {getUserIdxForTest, getUserStoragesForTest, startCall} from '../utils';

const userStorages = getUserStoragesForTest();

test.beforeEach(async ({page}) => {
    const devPage = new PlaywrightDevPage(page);
    await devPage.goto();
});

test.describe('channel toast', () => {
    const userIdx = getUserIdxForTest();
    test.use({storageState: userStorages[0]});

    test('dismissed and remains dismissed when leaving and returning to channel', async ({page}) => {
        const userPage = await startCall(userStorages[1]);

        await page.locator('.post__body').last().scrollIntoViewIfNeeded();

        const joinCallToast = page.locator('#calls-channel-toast');
        await expect(joinCallToast).toBeVisible();

        await page.locator('.toast__dismiss').click();

        await expect(joinCallToast).toBeHidden();

        await page.locator(`#sidebarItem_calls${userIdx + 1}`).click();
        await expect(page.locator('#calls-channel-toast')).toBeHidden();

        await page.locator(`#sidebarItem_calls${userIdx}`).click();
        await expect(page.locator('#calls-channel-toast')).toBeHidden();

        await userPage.leaveCall();
    });

    test('dismissed and reappears for next call while remaining in channel', async ({page}) => {
        const userPage = await startCall(userStorages[1]);

        await page.locator('.post__body').last().scrollIntoViewIfNeeded();

        await expect(page.locator('#calls-channel-toast')).toBeVisible();

        await page.locator('.toast__dismiss').click();

        await expect(page.locator('#calls-channel-toast')).toBeHidden();

        await userPage.leaveCall();
        await userPage.startCall();

        await expect(page.locator('#calls-channel-toast')).toBeVisible();

        await userPage.leaveCall();
    });

    test('does not reappear after leaving call (call ends)', async () => {
        const user0Page = await startCall(userStorages[0]);

        await expect(user0Page.page.locator('#calls-channel-toast')).toBeHidden();

        await user0Page.leaveCall();

        await user0Page.wait(3000);

        await expect(user0Page.page.locator('#calls-channel-toast')).toBeHidden();
    });
});
