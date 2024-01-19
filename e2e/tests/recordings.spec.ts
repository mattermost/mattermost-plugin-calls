import {chromium, expect, test} from '@playwright/test';

import {apiDisableTranscriptions, apiEnableTranscriptions} from '../config';
import {adminState, baseURL, defaultTeam, pluginID} from '../constants';
import PlaywrightDevPage from '../page';
import {getUserStoragesForTest, newUserPage} from '../utils';

test.beforeEach(async ({page, context}) => {
    const devPage = new PlaywrightDevPage(page);
    await devPage.goto();
});

test.describe('call recordings and transcriptions', () => {
    test.use({storageState: getUserStoragesForTest()[0]});

    test('recording - slash command', async ({page, request}) => {
        test.setTimeout(150000);

        await apiDisableTranscriptions();

        // start call
        const devPage = new PlaywrightDevPage(page);

        await devPage.startCall();

        // start recording
        await page.locator('#post_textbox').fill('/call recording start');
        await page.getByTestId('SendMessageButton').click();

        // verify recording badge renders correctly
        await expect(page.getByTestId('calls-recording-badge')).toBeVisible();
        await expect(page.getByTestId('calls-recording-badge')).toContainText('REC');

        // very recording start prompt renders correctly
        await expect(page.getByTestId('calls-widget-banner-recording')).toBeVisible();
        await expect(page.getByTestId('calls-widget-banner-recording')).toContainText('You\'re recording');

        // close prompt
        await page.getByTestId('calls-widget-banner-recording').locator('.icon-close').click();
        await expect(page.getByTestId('calls-widget-banner-recording')).toBeHidden();

        // Give it a few of seconds to produce a decent recording
        await devPage.wait(4000);

        // stop recording
        await page.locator('#post_textbox').fill('/call recording stop');
        await page.getByTestId('SendMessageButton').click();

        // very recording ended prompt renders correctly
        await expect(page.getByTestId('calls-widget-banner-recording')).toBeVisible();
        await expect(page.getByTestId('calls-widget-banner-recording')).toContainText('Recording has stopped. Processing…');

        // verify recording file has been posted by the bot (assumes CRT enabled)
        await page.locator('.post__body').last().locator('.ThreadFooter button.ReplyButton').click();
        await expect(page.locator('.ThreadViewer').locator('.post__header').last()).toContainText('calls');
        await expect(page.locator('.ThreadViewer').locator('.post__header').last()).toContainText('BOT');
        await expect(page.locator('.ThreadViewer').locator('.post__body').last().filter({has: page.getByTestId('fileAttachmentList')})).toBeVisible();

        // leave call
        await devPage.leaveCall();

        // Transcriptions test, we need to keep it here or it would conflict
        // with the above as tests are run concurrently.

        await page.reload();
        await apiEnableTranscriptions();

        // start call
        await devPage.startCall();

        // start recording
        await page.locator('#post_textbox').fill('/call recording start');
        await page.getByTestId('SendMessageButton').click();

        // very recording start prompt renders correctly
        await expect(page.getByTestId('calls-widget-banner-recording')).toBeVisible();
        await expect(page.getByTestId('calls-widget-banner-recording')).toContainText('Recording and transcription has started');

        // Unmute
        await devPage.unmute();

        // Give it a few of seconds to produce a decent recording
        await devPage.wait(4000);

        // stop recording
        await page.locator('#post_textbox').fill('/call recording stop');
        await page.getByTestId('SendMessageButton').click();

        // very recording ended prompt renders correctly
        await expect(page.getByTestId('calls-widget-banner-recording')).toBeVisible();
        await expect(page.getByTestId('calls-widget-banner-recording')).toContainText('Recording and transcription has stopped. Processing…');

        // verify transcription file has been posted by the bot (assumes CRT enabled)
        await page.locator('.post__body').last().locator('.ThreadFooter button.ReplyButton').click();
        await expect(page.locator('.ThreadViewer').locator('.post__header').last()).toContainText('calls');
        await expect(page.locator('.ThreadViewer').locator('.post__header').last()).toContainText('BOT');
        await expect(page.locator('.ThreadViewer').locator('.post__body').last().filter({has: page.getByTestId('calls-post-transcription-body')})).toContainText('Here\'s the call transcription');
        await expect(page.locator('.ThreadViewer').locator('.post__body').last().filter({has: page.getByTestId('fileAttachmentList')})).toBeVisible();

        // open recording's preview
        await page.locator('.ThreadViewer').locator('.post__body').nth(1).filter({has: page.getByTestId('fileAttachmentList')}).click();
        await expect(page.locator('.file-preview-modal__content')).toBeVisible();

        // verify transcription track exists
        await expect(page.getByTestId('calls-recording-transcription')).toHaveAttribute('label', 'en');
        await expect(page.getByTestId('calls-recording-transcription')).toHaveAttribute('srclang', 'en');

        // fetch transcription file and verify it has the expected content
        const src = await page.getByTestId('calls-recording-transcription').getAttribute('src');
        const resp = await request.get(`${baseURL}${src}`);
        expect(resp.status()).toEqual(200);
        const transcriptionData = await resp.body();
        await expect(transcriptionData.toString()).toContain('This is a test transcription sample');

        // exit preview
        await page.keyboard.press('Escape');

        // leave call
        await devPage.leaveCall();
    });
});
