import {test, expect, chromium} from '@playwright/test';

import {userState, baseURL, defaultTeam, pluginID} from '../constants';

import {getChannelNameForTest, getUserIdxForTest} from '../utils';

test.describe('global widget', () => {
    test.use({storageState: userState.users[getUserIdxForTest()].storageStatePath});

    test('start call', async ({page, request}) => {
        const channelName = getChannelNameForTest();
        const resp = await request.get(`${baseURL}/api/v4/teams/name/${defaultTeam}/channels/name/${channelName}`);
        const channel = await resp.json();

        await page.goto(`${baseURL}/plugins/${pluginID}/standalone/widget.html?call_id=${channel.id}`);
        await expect(page.locator('#calls-widget')).toBeVisible();
        await expect(page.locator('#calls-widget-leave-button')).toBeVisible();
        await page.locator('#calls-widget-leave-button').click();
        await expect(page.locator('#calls-widget')).toBeHidden();
    });
});
