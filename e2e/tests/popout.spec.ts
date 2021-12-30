import {test, expect, chromium} from '@playwright/test';

import PlaywrightDevPage from '../page';
import {userState} from '../constants';

test.describe('popout window', () => {
    test.use({storageState: userState.users[3].storageStatePath});

    test('popout opens unmuted', async ({page, context}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.goto(`calls${process.env.TEST_PARALLEL_INDEX}`);
        await devPage.startCall();

        const [popOut, _] = await Promise.all([
            context.waitForEvent('page'),
            page.click('#calls-widget-expand-button'),
        ]);
        await expect(popOut.locator('#calls-expanded-view')).toBeVisible();
        await expect(popOut.locator('#calls-popout-mute-button')).toBeVisible();
        const text = await popOut.textContent('#calls-popout-mute-button');
        expect(text).toBe('Unmute');

        await devPage.leaveCall();
    });
});

