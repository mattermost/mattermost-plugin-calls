import {test, expect, chromium} from '@playwright/test';

import PlaywrightDevPage from '../page';
import {newUserPage, startCall, joinCall, getUserStoragesForTest, getUsernamesForTest} from '../utils';

const userStorages = getUserStoragesForTest();
const usernames = getUsernamesForTest();

test.beforeEach(async ({page, context}) => {
    const devPage = new PlaywrightDevPage(page);
    await devPage.goto();
});

test.describe('join call', () => {
    test.use({storageState: userStorages[0]});

    test('channel header button', async ({page}) => {
        // start a call
        const userPage = await startCall(userStorages[1]);

        const devPage = new PlaywrightDevPage(page);
        await devPage.joinCall();
        await devPage.leaveCall();

        await userPage.leaveCall();
    });

    test('channel toast', async ({page}) => {
        // start a call
        const userPage = await startCall(userStorages[1]);

        await page.locator('.post__body').last().scrollIntoViewIfNeeded();

        const joinCallToast = page.locator('#calls-channel-toast');
        await expect(joinCallToast).toBeVisible();
        expect(await joinCallToast.screenshot()).toMatchSnapshot('channel-toast.png');

        await joinCallToast.click();

        await expect(userPage.page.getByTestId('call-joined-participant-notification')).toBeVisible();
        await expect(userPage.page.getByTestId('call-joined-participant-notification')).toContainText(usernames[0] + ' has joined the call.');

        await expect(page.locator('#calls-widget')).toBeVisible();
        await expect(page.getByTestId('calls-widget-loading-overlay')).toBeHidden();

        const devPage = new PlaywrightDevPage(page);
        await devPage.leaveCall();

        await userPage.leaveCall();
    });

    test('call thread', async ({page}) => {
        // start a call
        const userPage = await startCall(userStorages[1]);

        const joinCallButton = page.locator('.post__body').last().locator('button:has-text("Join call")');
        await expect(joinCallButton).toBeVisible();

        await expect(page.locator('data-testid=call-thread').last()).toBeVisible();

        expect(await page.locator('data-testid=call-thread').last().screenshot()).toMatchSnapshot('call-thread-join.png');

        await joinCallButton.click();
        await expect(page.locator('#calls-widget')).toBeVisible();
        await expect(page.getByTestId('calls-widget-loading-overlay')).toBeHidden();

        expect(await page.locator('data-testid=call-thread').last().screenshot()).toMatchSnapshot('call-thread-leave.png');

        const leaveCallButton = page.locator('.post__body').last().locator('button:has-text("Leave call")');
        await expect(leaveCallButton).toBeVisible();
        await leaveCallButton.click();
        await expect(page.locator('#calls-widget')).toBeHidden();

        await userPage.leaveCall();
    });

    test('user profile popover', async ({page}) => {
        const userAPage = page;
        const userBPage = await newUserPage(userStorages[1]);
        await userBPage.goto();

        // We have both users send a message so it's much easier to
        // consistently find the proper selector to open the profile.
        await userAPage.locator('#post_textbox').fill('messageA');
        await userAPage.locator('[data-testid=SendMessageButton]').click();
        await userBPage.page.locator('#post_textbox').fill('messageB');
        await userBPage.page.locator('[data-testid=SendMessageButton]').click();

        await userAPage.locator('.post__header').locator('button.user-popover').last().click();
        await expect(userAPage.locator('#user-profile-popover')).toBeVisible();
        await userAPage.locator('#user-profile-popover').locator('#startCallButton').click();

        await expect(userAPage.locator('#calls-widget')).toBeVisible();
        await expect(userAPage.locator('#calls-widget-loading-overlay')).toBeHidden();

        await userAPage.locator('#calls-widget-leave-button').click();
        await expect(userAPage.locator('#calls-widget')).toBeHidden();

        // We then verify that join button is disabled if the other user is already in a call.
        await userBPage.startCall();

        // We have both users send a message so it's much easier to
        // consistently find the proper selector to open the profile.
        await userAPage.locator('#post_textbox').fill('messageA');
        await userAPage.locator('[data-testid=SendMessageButton]').click();
        await userBPage.page.locator('#post_textbox').fill('messageB');
        await userBPage.page.locator('[data-testid=SendMessageButton]').click();

        await userAPage.locator('.post__header').locator('button.user-popover').last().click();
        await expect(userAPage.locator('#user-profile-popover')).toBeVisible();
        await expect(userAPage.locator('#user-profile-popover').locator('#startCallButton')).toBeDisabled();

        await userBPage.leaveCall();
    });

    test('multiple sessions per user', async ({page}) => {
        test.setTimeout(180000);

        // start a call
        const sessionAPage = await startCall(userStorages[1]);
        const sessionBPage = await joinCall(userStorages[1]);
        const sessionCPage = await joinCall(userStorages[1]);

        // Verify there are three participants
        const numParticipantsEl = sessionCPage.page.locator('#calls-widget-participants-button span');
        await expect(numParticipantsEl).toBeVisible();
        const content = await numParticipantsEl.textContent();
        if (content !== '3') {
            test.fail();
            return;
        }

        await sessionAPage.leaveCall();
        await sessionBPage.leaveCall();
        await sessionCPage.leaveCall();
    });
});
