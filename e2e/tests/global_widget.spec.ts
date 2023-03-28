import {test, expect} from '@playwright/test';

import {userState, baseURL, defaultTeam, pluginID} from '../constants';

import {getChannelNamesForTest, getUserIdxForTest} from '../utils';

test.describe('global widget', () => {
    test.use({storageState: userState.users[getUserIdxForTest()].storageStatePath});

    test('start call', async ({page, request}) => {
        const channelName = getChannelNamesForTest()[0];
        const resp = await request.get(`${baseURL}/api/v4/teams/name/${defaultTeam}/channels/name/${channelName}`);
        const channel = await resp.json();

        await page.goto(`${baseURL}/plugins/${pluginID}/standalone/widget.html?call_id=${channel.id}`);
        await expect(page.locator('#calls-widget')).toBeVisible();
        await expect(page.locator('#calls-widget-leave-button')).toBeVisible();
        await page.locator('#calls-widget-leave-button').click();
        await expect(page.locator('#calls-widget')).toBeHidden();
    });

    test('recording widget banner', async ({page, request, context}) => {
        // start call
        const channelName = getChannelNamesForTest()[0];
        const resp = await request.get(`${baseURL}/api/v4/teams/name/${defaultTeam}/channels/name/${channelName}`);
        const channel = await resp.json();

        await page.goto(`${baseURL}/plugins/${pluginID}/standalone/widget.html?call_id=${channel.id}`);
        await expect(page.locator('#calls-widget')).toBeVisible();

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

        // very recording ended prompt renders correctly
        await expect(page.getByTestId('calls-widget-banner-recording')).toBeVisible();
        await expect(page.getByTestId('calls-widget-banner-recording')).toContainText('Recording has stopped. Processing…');

        // leave call
        await page.locator('#calls-widget-leave-button').click();
        await expect(page.locator('#calls-widget')).toBeHidden();
    });
});
