import {test, expect, chromium} from '@playwright/test';

import {userState, baseURL, defaultTeam, pluginID} from '../constants';

import {getChannelNameForTest} from '../utils';

import PlaywrightDevPage from '../page';

test.beforeEach(async ({page, context}) => {
    const devPage = new PlaywrightDevPage(page);
    await devPage.goto();
});

test.describe('call recordings', () => {
    test.use({storageState: userState.users[6].storageStatePath});

    test('recording - slash command', async ({page}) => {
        const channelName = getChannelNameForTest();

        // start call
        const devPage = new PlaywrightDevPage(page);
        await devPage.startCall();

        // start recording
        await page.locator('#post_textbox').fill('/call recording start');
        await page.locator('[data-testid=SendMessageButton]').click();

        // verify recording badge renders correctly
        await expect(page.getByTestId('calls-recording-badge')).toBeVisible();
        await expect(page.getByTestId('calls-recording-badge')).toContainText('REC');

        // very recording start prompt renders correctly
        await expect(page.getByTestId('calls-widget-banner-recording')).toBeVisible();
        await expect(page.getByTestId('calls-widget-banner-recording')).toContainText('You are recording');

        // close prompt
        await page.getByTestId('calls-widget-banner-recording').locator('.icon-close').click();
        await expect(page.getByTestId('calls-widget-banner-recording')).toBeHidden();

        // Give it a few of seconds to produce a decent recording
        await devPage.wait(4000);

        // stop recording
        await page.locator('#post_textbox').fill('/call recording stop');
        await page.locator('[data-testid=SendMessageButton]').click();

        // very recording ended prompt renders correctly
        await expect(page.getByTestId('calls-widget-banner-recording')).toBeVisible();
        await expect(page.getByTestId('calls-widget-banner-recording')).toContainText('Recording has stopped. Processing...');

        // verify recording file has been posted by the bot (assumes CRT enabled)
        await page.locator('.post__body').last().locator('.ThreadFooter button.ReplyButton').click();
        await expect(page.locator('.ThreadViewer').locator('.post__header').last()).toContainText('calls');
        await expect(page.locator('.ThreadViewer').locator('.post__header').last()).toContainText('BOT');
        await expect(page.locator('.ThreadViewer').locator('.post__body').last().filter({has: page.getByTestId('fileAttachmentList')})).toBeVisible();

        // leave call
        await devPage.leaveCall();
    });
});
