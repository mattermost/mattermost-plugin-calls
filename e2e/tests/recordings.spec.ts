import {expect, test} from '@playwright/test';

import {apiSetEnableLiveCaptions, apiSetEnableTranscriptions} from '../config';
import {baseURL} from '../constants';
import PlaywrightDevPage from '../page';
import {getUserStoragesForTest} from '../utils';

test.beforeEach(async ({page}) => {
    const devPage = new PlaywrightDevPage(page);
    await devPage.goto();
});

test.describe('call recordings, transcriptions, live-captions', () => {
    test.use({storageState: getUserStoragesForTest()[0]});

    test('slash command, popout + buttons', async ({page, context, request}) => {
        test.setTimeout(150000);

        await apiSetEnableTranscriptions(false);

        // start call
        const devPage = new PlaywrightDevPage(page);

        await devPage.startCall();

        // start recording
        await page.locator('#post_textbox').fill('/call recording start');
        await page.getByTestId('SendMessageButton').click();

        // verify recording badge renders correctly
        await expect(page.getByTestId('calls-recording-badge')).toBeVisible();
        await expect(page.getByTestId('calls-recording-badge')).toContainText('REC');

        // verify recording start prompt renders correctly
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

        // verify recording ended prompt renders correctly
        await expect(page.getByTestId('calls-widget-banner-recording')).toBeVisible();
        await expect(page.getByTestId('calls-widget-banner-recording')).toContainText('Recording has stopped. Processing…');

        // verify recording file has been posted by the bot (assumes CRT enabled)
        await page.locator('.post__body').last().locator('.ThreadFooter button.ReplyButton').click();
        await expect(page.locator('.ThreadViewer').locator('.post__header').last()).toContainText('calls');
        await expect(page.locator('.ThreadViewer').locator('.post__header').last()).toContainText('BOT');
        await expect(page.locator('.ThreadViewer').locator('.post__body').last().filter({has: page.getByTestId('fileAttachmentList')})).toBeVisible();

        // leave call
        await devPage.leaveCall();

        //
        // Transcriptions test, we need to keep it here or it would conflict
        // with the above as tests are run concurrently.
        //
        await page.reload();
        await apiSetEnableTranscriptions(true);

        // start call
        await devPage.startCall();

        // start recording
        await page.locator('#post_textbox').fill('/call recording start');
        await page.getByTestId('SendMessageButton').click();

        // verify recording start prompt renders correctly
        await expect(page.getByTestId('calls-widget-banner-recording')).toBeVisible();
        await expect(page.getByTestId('calls-widget-banner-recording')).toContainText('Recording and transcription has started');

        // Unmute
        await devPage.unmute();

        // Give it a few of seconds to produce a decent recording
        await devPage.wait(4000);

        // stop recording
        await page.locator('#post_textbox').fill('/call recording stop');
        await page.getByTestId('SendMessageButton').click();

        // verify recording ended prompt renders correctly
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
        await expect(transcriptionData.toString().toLowerCase()).toContain('this is a test transcription sample');

        // exit preview
        await page.keyboard.press('Escape');

        // leave call
        await devPage.leaveCall();

        //
        // Live captions tests.
        // First, verify [cc] is not available when live captions is off.
        //
        await page.reload();
        await apiSetEnableLiveCaptions(false);

        // start call
        await devPage.startCall();

        let [popOut] = await Promise.all([
            context.waitForEvent('page'),
            page.click('#calls-widget-expand-button'),
        ]);
        await expect(popOut.locator('#calls-expanded-view')).toBeVisible();

        // start recording with button
        await popOut.locator('#calls-popout-record-button').click();

        // verify we get the badge
        await expect(popOut.getByTestId('calls-recording-badge')).toBeVisible();
        await expect(popOut.getByTestId('calls-recording-badge')).toContainText('REC');

        // verify we get the recording start prompt
        await expect(popOut.getByTestId('banner-recording')).toBeVisible();
        await expect(popOut.getByTestId('banner-recording')).toContainText('Recording and transcription has started');

        // close the banner
        await popOut.getByTestId('popout-prompt-close').click();
        await expect(popOut.getByTestId('banner-recording')).toBeHidden();

        // verify we do not have the [cc] button
        await popOut.locator('#calls-popout-settings-button').click();
        await expect(popOut.locator('#calls-popout-cc-button')).toBeHidden();

        // stop recording
        await popOut.locator('#calls-popout-record-button').click();

        // stop recording confirmation
        await expect(popOut.locator('#stop_recording_confirmation')).toBeVisible();
        await popOut.getByTestId('modal-confirm-button').click();

        // verify recording ended prompt renders correctly
        await expect(popOut.getByTestId('banner-recording-stopped')).toBeVisible();
        await expect(popOut.getByTestId('banner-recording-stopped')).toContainText('Recording and transcription has stopped. Processing…');

        // leave call
        let popOutDev = new PlaywrightDevPage(popOut);
        await popOutDev.leaveFromPopout();

        //
        // Lice captions tests.
        // Second, verify [cc] is available and gives us the right closed captions.
        //
        await page.reload();
        await apiSetEnableLiveCaptions(true);

        // start call
        await devPage.startCall();

        [popOut] = await Promise.all([
            context.waitForEvent('page'),
            page.click('#calls-widget-expand-button'),
        ]);
        await expect(popOut.locator('#calls-expanded-view')).toBeVisible();

        // start recording with button
        await popOut.locator('#calls-popout-record-button').click();

        // verify we get the badge
        await expect(popOut.getByTestId('calls-recording-badge')).toBeVisible();
        await expect(popOut.getByTestId('calls-recording-badge')).toContainText('REC');

        // verify we get the recording start prompt
        await expect(popOut.getByTestId('banner-recording')).toBeVisible();
        await expect(popOut.getByTestId('banner-recording')).toContainText('Recording and transcription has started');

        // close the banner
        await popOut.getByTestId('popout-prompt-close').click();
        await expect(popOut.getByTestId('banner-recording')).toBeHidden();

        // verify we have the [cc] button
        await popOut.locator('#calls-popout-settings-button').click();
        await expect(popOut.locator('#calls-popout-cc-button')).toBeVisible();

        // toggle closed captioning
        await popOut.locator('#calls-popout-cc-button').click();

        // Unmute
        await popOut.locator('#calls-popout-mute-button').click();

        // Wait for the closed captioning
        await expect(popOut.locator('[class^="Caption-"]')).toContainText('This is a test transcription sample', {ignoreCase: true});

        // stop recording
        await popOut.locator('#calls-popout-record-button').click();

        // stop recording confirmation
        await expect(popOut.locator('#stop_recording_confirmation')).toBeVisible();
        await popOut.getByTestId('modal-confirm-button').click();

        // verify recording ended prompt renders correctly
        await expect(popOut.getByTestId('banner-recording-stopped')).toBeVisible();
        await expect(popOut.getByTestId('banner-recording-stopped')).toContainText('Recording and transcription has stopped. Processing…');

        // leave call
        popOutDev = new PlaywrightDevPage(popOut);
        await popOutDev.leaveFromPopout();
    });

    test('recording - no participants left', async ({page}) => {
        // start call
        const devPage = new PlaywrightDevPage(page);

        await devPage.startCall();

        // start recording
        await page.locator('#post_textbox').fill('/call recording start');
        await page.getByTestId('SendMessageButton').click();

        // verify recording start prompt renders correctly
        await expect(page.getByTestId('calls-widget-banner-recording')).toBeVisible();

        // Give it a few of seconds to produce a decent recording
        await devPage.wait(4000);

        // leave call
        await devPage.leaveCall();

        // verify recording file has been posted by the bot (assumes CRT enabled)
        await page.locator('.post__body').last().locator('.ThreadFooter button.ReplyButton').click();
        await expect(page.locator('.ThreadViewer').locator('.post__header').last()).toContainText('calls');
        await expect(page.locator('.ThreadViewer').locator('.post__header').last()).toContainText('BOT');
        await expect(page.locator('.ThreadViewer').locator('.post__body').last().filter({has: page.getByTestId('fileAttachmentList')})).toBeVisible();
    });

    test('recording - call end', async ({page}) => {
        // start call
        const devPage = new PlaywrightDevPage(page);

        await devPage.startCall();

        // start recording
        await page.locator('#post_textbox').fill('/call recording start');
        await page.getByTestId('SendMessageButton').click();

        // verify recording start prompt renders correctly
        await expect(page.getByTestId('calls-widget-banner-recording')).toBeVisible();

        // Give it a few of seconds to produce a decent recording
        await devPage.wait(4000);

        // forcefully end call
        await page.locator('#post_textbox').fill('/call end');
        await page.getByTestId('SendMessageButton').click();
        await expect(page.locator('#calls-end-call-modal')).toBeVisible();
        await page.locator('#calls-end-call-modal').locator('button', {hasText: 'End call'}).click();

        // verify user has been kicked out
        await page.waitForFunction(() => !window.callsClient || window.callsClient.closed);
        await expect(page.locator('#calls-widget')).toBeHidden();

        // verify recording file has been posted by the bot (assumes CRT enabled)
        await page.locator('.post__body').last().locator('.ThreadFooter button.ReplyButton').click();
        await expect(page.locator('.ThreadViewer').locator('.post__header').last()).toContainText('calls');
        await expect(page.locator('.ThreadViewer').locator('.post__header').last()).toContainText('BOT');
        await expect(page.locator('.ThreadViewer').locator('.post__body').last().filter({has: page.getByTestId('fileAttachmentList')})).toBeVisible();
    });

    test('recording - widget menu', async ({page}) => {
        // start call
        const devPage = new PlaywrightDevPage(page);
        await devPage.startCall();

        // Open menu
        await page.locator('#calls-widget-toggle-menu-button').click();

        // Verify record menu item has the expected text
        await expect(page.locator('#calls-widget-menu-record-button')).toContainText('Record call');

        // Click to start recording
        await page.locator('#calls-widget-menu-record-button').click();

        // Verify menu closed
        await expect(page.getByTestId('calls-widget-menu')).toBeHidden();

        // Verify recording start prompt renders correctly
        await expect(page.getByTestId('calls-widget-banner-recording')).toBeVisible();

        // Give it a few of seconds to produce a decent recording
        await devPage.wait(4000);

        // Open menu
        await page.locator('#calls-widget-toggle-menu-button').click();

        // Verify record menu item has the expected text
        await expect(page.locator('#calls-widget-menu-record-button')).toContainText('Stop recording');

        // Click to stop recording
        await page.locator('#calls-widget-menu-record-button').click();

        // Verify menu closed
        await expect(page.getByTestId('calls-widget-menu')).toBeHidden();

        // Stop recording confirmation
        await expect(page.locator('#stop_recording_confirmation')).toBeVisible();
        await page.getByTestId('modal-confirm-button').click();

        // Leave call
        await devPage.leaveCall();
    });
});
