import {expect, test} from '@playwright/test';

import PlaywrightDevPage from '../page';
import {getChannelNamesForTest, getUserStoragesForTest} from '../utils';

test.describe('global widget', () => {
    test.use({storageState: getUserStoragesForTest()[0]});

    test('start call', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.openWidget(getChannelNamesForTest()[0]);

        await expect(page.locator('#calls-widget-leave-button')).toBeVisible();
        await devPage.leaveFromWidget();
        await expect(page.locator('#calls-widget')).toBeHidden();
    });

    test('recording widget banner and stop confirmation modal', async ({page, context}) => {
        // start call
        const devPage = new PlaywrightDevPage(page);
        await devPage.openWidget(getChannelNamesForTest()[0]);

        // open popout to control recording
        const [popOut, _] = await Promise.all([
            context.waitForEvent('page'),
            page.click('#calls-widget-expand-button'),
        ]);
        await expect(popOut.locator('#calls-expanded-view')).toBeVisible();

        // start recording
        await expect(popOut.locator('#calls-popout-record-button')).toBeVisible();
        await popOut.locator('#calls-popout-record-button').click();

        // verify recording banner renders correctly
        await expect(page.getByTestId('calls-widget-banner-recording')).toBeVisible();

        await expect(page.getByTestId('calls-widget-banner-recording')).toContainText('You\'re recording');

        // close prompt
        await page.getByTestId('calls-widget-banner-recording').locator('.icon-close').click();
        await expect(page.getByTestId('calls-widget-banner-recording')).toBeHidden();

        // stop recording
        await popOut.locator('#calls-popout-record-button').click();

        // verify stop recording confirmation banner renders
        await expect(popOut.locator('#stop_recording_confirmation')).toBeVisible();
        await popOut.getByTestId('modal-confirm-button').click();

        // verify recording ended prompt renders correctly
        await expect(page.getByTestId('calls-widget-banner-recording')).toBeVisible();

        await expect(page.getByTestId('calls-widget-banner-recording')).toContainText('Recording has stopped. Processing…');

        // leave call
        await devPage.leaveFromWidget();
        await expect(page.locator('#calls-widget')).toBeHidden();
    });

    test('recording banner dismissed works cross-window and is remembered - clicked on widget', async ({
        page,
        context,
    }) => {
        // start call
        const devPage = new PlaywrightDevPage(page);
        await devPage.openWidget(getChannelNamesForTest()[0]);

        // open popout to control recording
        let [popOut] = await Promise.all([
            context.waitForEvent('page'),
            page.click('#calls-widget-expand-button'),
        ]);
        await expect(popOut.locator('#calls-expanded-view')).toBeVisible();

        // start recording
        await expect(popOut.locator('#calls-popout-record-button')).toBeVisible();
        await popOut.locator('#calls-popout-record-button').click();

        // verify recording banner renders correctly on widget
        await expect(page.getByTestId('calls-widget-banner-recording')).toBeVisible();
        await expect(page.getByTestId('calls-widget-banner-recording')).toContainText('You\'re recording');

        // verify recording banner renders correctly in popout
        await expect(popOut.getByTestId('banner-recording')).toBeVisible();
        await expect(popOut.getByTestId('banner-recording')).toContainText('You\'re recording');

        // close prompt on widget
        await page.getByTestId('calls-widget-banner-recording').locator('.icon-close').click();
        await expect(page.getByTestId('calls-widget-banner-recording')).toBeHidden();

        // should close prompt on popout as well
        await expect(popOut.getByTestId('banner-recording')).toBeHidden();

        // close and reopen popout
        await popOut.close();
        await expect(popOut.isClosed()).toBeTruthy();
        [popOut] = await Promise.all([
            context.waitForEvent('page'),
            page.click('#calls-widget-expand-button'),
        ]);
        await expect(popOut.locator('#calls-expanded-view')).toBeVisible();

        // prompt should not be visible, wait a couple seconds to make sure state has settled down
        await popOut.waitForTimeout(2000);
        await expect(popOut.getByTestId('banner-recording')).toBeHidden();

        // stop recording
        await popOut.locator('#calls-popout-record-button').click();

        // stop recording confirmation
        await expect(popOut.locator('#stop_recording_confirmation')).toBeVisible();
        await popOut.getByTestId('modal-confirm-button').click();

        // very recording ended prompt renders correctly on widget and in popout
        await expect(page.getByTestId('calls-widget-banner-recording')).toBeVisible();
        await expect(page.getByTestId('calls-widget-banner-recording')).toContainText('Recording has stopped. Processing…');
        await expect(popOut.getByTestId('banner-recording-stopped')).toBeVisible();
        await expect(popOut.getByTestId('banner-recording-stopped')).toContainText('Recording has stopped. Processing…');

        // close prompt on widget
        await page.getByTestId('calls-widget-banner-recording').locator('.icon-close').click();
        await expect(page.getByTestId('calls-widget-banner-recording')).toBeHidden();

        // should close prompt on popout as well
        await expect(popOut.getByTestId('banner-recording-stopped')).toBeHidden();

        // leave call
        await devPage.leaveFromWidget();
        await expect(page.locator('#calls-widget')).toBeHidden();
    });

    test('recording banner dismissed works cross-window and is remembered - clicked on popout', async ({
        page,
        context,
    }) => {
        // start call
        const devPage = new PlaywrightDevPage(page);
        await devPage.openWidget(getChannelNamesForTest()[0]);

        // open popout to control recording
        let [popOut] = await Promise.all([
            context.waitForEvent('page'),
            page.click('#calls-widget-expand-button'),
        ]);
        await expect(popOut.locator('#calls-expanded-view')).toBeVisible();

        // start recording
        await expect(popOut.locator('#calls-popout-record-button')).toBeVisible();
        await popOut.locator('#calls-popout-record-button').click();

        // verify recording banner renders correctly on widget
        await expect(page.getByTestId('calls-widget-banner-recording')).toBeVisible();
        await expect(page.getByTestId('calls-widget-banner-recording')).toContainText('You\'re recording');

        // verify recording banner renders correctly in popout
        await expect(popOut.getByTestId('banner-recording')).toBeVisible();
        await expect(popOut.getByTestId('banner-recording')).toContainText('You\'re recording');

        // close prompt on popout
        await popOut.getByTestId('banner-recording').locator('.icon-close').click();
        await expect(popOut.getByTestId('banner-recording')).toBeHidden();

        // should close prompt on widget as well
        await expect(page.getByTestId('calls-widget-banner-recording')).toBeHidden();

        // close and reopen popout
        await popOut.close();
        await expect(popOut.isClosed()).toBeTruthy();
        [popOut] = await Promise.all([
            context.waitForEvent('page'),
            page.click('#calls-widget-expand-button'),
        ]);
        await expect(popOut.locator('#calls-expanded-view')).toBeVisible();

        // prompt should not be visible, wait a couple seconds to make sure state has settled down
        await popOut.waitForTimeout(2000);
        await expect(popOut.getByTestId('banner-recording')).toBeHidden();

        // stop recording
        await popOut.locator('#calls-popout-record-button').click();

        // stop recording confirmation
        await expect(popOut.locator('#stop_recording_confirmation')).toBeVisible();
        await popOut.getByTestId('modal-confirm-button').click();

        // very recording ended prompt renders correctly on widget and in popout
        await expect(page.getByTestId('calls-widget-banner-recording')).toBeVisible();
        await expect(page.getByTestId('calls-widget-banner-recording')).toContainText('Recording has stopped. Processing…');
        await expect(popOut.getByTestId('banner-recording-stopped')).toBeVisible();
        await expect(popOut.getByTestId('banner-recording-stopped')).toContainText('Recording has stopped. Processing…');

        // close prompt on popout
        await popOut.getByTestId('banner-recording-stopped').locator('.icon-close').click();
        await expect(popOut.getByTestId('banner-recording-stopped')).toBeHidden();

        // should close prompt on widget as well
        await expect(page.getByTestId('calls-widget-banner-recording')).toBeHidden();

        // leave call
        await devPage.leaveFromWidget();
        await expect(page.locator('#calls-widget')).toBeHidden();
    });
});
