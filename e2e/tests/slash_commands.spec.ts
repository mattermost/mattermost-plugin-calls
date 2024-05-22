import {chromium, expect, test} from '@playwright/test';
import {readFile} from 'fs/promises';

import PlaywrightDevPage from '../page';
import {getUserIdxForTest, getUserStoragesForTest} from '../utils';

test.beforeEach(async ({page, context}) => {
    const devPage = new PlaywrightDevPage(page);
    await devPage.goto();
});

test.describe('slash commands', () => {
    const userIdx = getUserIdxForTest();
    test.use({storageState: getUserStoragesForTest()[0]});

    test('end call', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);

        // Solely needed to wait till the page has loaded.
        await expect(page.locator('[aria-label="channel header region"] button:has-text("Start call")')).toBeVisible();

        if (process.platform === 'darwin') {
            await page.keyboard.press('Meta+Alt+S');
        } else {
            await page.keyboard.press('Control+Alt+S');
        }

        await expect(page.locator('#calls-widget')).toBeVisible();
        await expect(page.getByTestId('calls-widget-loading-overlay')).toBeHidden();

        await devPage.endCall();

        // /call end cleans up all indicators of a running call
        await expect(page.locator('#calls-widget')).toBeHidden();
        await expect(page.locator('#calls-channel-toast')).toBeHidden();
        await expect(page.locator(`#sidebarItem_calls${userIdx}`).getByTestId('calls-sidebar-active-call-icon')).toBeHidden();
    });
});
