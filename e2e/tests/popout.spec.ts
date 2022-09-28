import {test, expect, chromium} from '@playwright/test';

import PlaywrightDevPage from '../page';
import {userState} from '../constants';
import {getChannelNameForTest} from '../utils';

test.describe('popout window', () => {
    test.use({storageState: userState.users[4].storageStatePath});

    test('popout opens muted', async ({page, context}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.goto();
        await devPage.startCall();

        const [popOut, _] = await Promise.all([
            context.waitForEvent('page'),
            page.click('#calls-widget-expand-button'),
        ]);
        await expect(popOut.locator('#calls-expanded-view')).toBeVisible();
        expect(await popOut.locator('#calls-expanded-view-participants-grid').screenshot()).toMatchSnapshot('expanded-view-participants-grid.png');
        expect(await popOut.locator('#calls-expanded-view-controls').screenshot()).toMatchSnapshot('expanded-view-controls.png');
        await expect(popOut.locator('#calls-popout-mute-button')).toBeVisible();
        const text = await popOut.textContent('#calls-popout-mute-button');

        await popOut.locator('.button-leave').click();
    });

    test('window title matches', async ({page, context}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.goto();
        await devPage.startCall();

        const [popOut, _] = await Promise.all([
            context.waitForEvent('page'),
            page.click('#calls-widget-expand-button'),
        ]);
        await expect(popOut.locator('#calls-expanded-view')).toBeVisible();
        await expect(popOut).toHaveTitle(`Call - ${getChannelNameForTest()}`);
        await expect(page).not.toHaveTitle(`Call - ${getChannelNameForTest()}`);

        await popOut.locator('.button-leave').click();
    });
});

