import {test, expect, chromium} from '@playwright/test';

import PlaywrightDevPage from '../page';
import {userState} from '../constants';

test.beforeEach(async ({page, context}) => {
    const devPage = new PlaywrightDevPage(page);
    await devPage.goto();
});

test.describe('join call', () => {
    test.use({storageState: userState.users[2].storageStatePath});

    const startCall = async () => {
        const browser = await chromium.launch();
        const context = await browser.newContext({storageState: userState.users[3].storageStatePath});
        const userPage = new PlaywrightDevPage(await context.newPage());
        await userPage.goto();
        await userPage.startCall();
        return () => {
            userPage.leaveCall();
        };
    };

    test('channel header button', async ({page}) => {
        // start a call
        const leaveCall = await startCall();

        const devPage = new PlaywrightDevPage(page);
        await devPage.joinCall();
        await devPage.leaveCall();

        await leaveCall();
    });

    test('channel toast', async ({page}) => {
        // start a call
        const leaveCall = await startCall();

        await page.locator('.post__body').last().scrollIntoViewIfNeeded();

        const joinCallToast = page.locator('#calls-channel-toast');
        await expect(joinCallToast).toBeVisible();
        expect(await joinCallToast.screenshot()).toMatchSnapshot('channel-toast.png');

        await joinCallToast.click();
        await expect(page.locator('#calls-widget')).toBeVisible();
        const devPage = new PlaywrightDevPage(page);
        await devPage.leaveCall();

        await leaveCall();
    });

    test('call thread', async ({page}) => {
        // start a call
        const leaveCall = await startCall();

        const joinCallButton = page.locator('.post__body').last().locator('button:has-text("Join call")');
        await expect(joinCallButton).toBeVisible();

        expect(await page.locator('.call-thread').last().screenshot()).toMatchSnapshot('call-thread-join.png');

        await joinCallButton.click();
        await expect(page.locator('#calls-widget')).toBeVisible();

        expect(await page.locator('.call-thread').last().screenshot()).toMatchSnapshot('call-thread-leave.png');

        const leaveCallButton = page.locator('.post__body').last().locator('button:has-text("Leave call")');
        await expect(leaveCallButton).toBeVisible();
        await leaveCallButton.click();
        await expect(page.locator('#calls-widget')).toBeHidden();

        await leaveCall();
    });
});
