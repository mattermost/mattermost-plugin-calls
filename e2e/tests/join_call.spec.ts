import {test, expect, chromium} from '@playwright/test';

import PlaywrightDevPage from '../page';
import {userState} from '../constants';
import {startCall} from '../utils';

test.beforeEach(async ({page, context}) => {
    const devPage = new PlaywrightDevPage(page);
    await devPage.goto();
});

test.describe('join call', () => {
    test.use({storageState: userState.users[2].storageStatePath});

    test('channel header button', async ({page}) => {
        // start a call
        const userPage = await startCall(userState.users[3].storageStatePath);

        const devPage = new PlaywrightDevPage(page);
        await devPage.joinCall();
        await devPage.leaveCall();

        await userPage.leaveCall();
    });

    test('channel toast', async ({page}) => {
        // start a call
        const userPage = await startCall(userState.users[3].storageStatePath);

        await page.locator('.post__body').last().scrollIntoViewIfNeeded();

        const joinCallToast = page.locator('#calls-channel-toast');
        await expect(joinCallToast).toBeVisible();
        expect(await joinCallToast.screenshot()).toMatchSnapshot('channel-toast.png');

        await joinCallToast.click();
        await expect(page.locator('#calls-widget')).toBeVisible();
        const devPage = new PlaywrightDevPage(page);
        await devPage.leaveCall();

        await userPage.leaveCall();
    });

    test('call thread', async ({page}) => {
        // start a call
        const userPage = await startCall(userState.users[3].storageStatePath);

        const joinCallButton = page.locator('.post__body').last().locator('button:has-text("Join call")');
        await expect(joinCallButton).toBeVisible();

        await expect(page.locator('data-testid=call-thread').last()).toBeVisible();

        expect(await page.locator('data-testid=call-thread').last().screenshot()).toMatchSnapshot('call-thread-join.png');

        await joinCallButton.click();
        await expect(page.locator('#calls-widget')).toBeVisible();

        expect(await page.locator('data-testid=call-thread').last().screenshot()).toMatchSnapshot('call-thread-leave.png');

        const leaveCallButton = page.locator('.post__body').last().locator('button:has-text("Leave call")');
        await expect(leaveCallButton).toBeVisible();
        await leaveCallButton.click();
        await expect(page.locator('#calls-widget')).toBeHidden();

        await userPage.leaveCall();
    });
});
