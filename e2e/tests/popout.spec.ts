import {test, expect} from '@playwright/test';

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

        await popOut.locator('#calls-popout-leave-button').click();
    });

    test('popout opens in a DM channel', async ({page, context}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.gotoDM(userState.users[0].username);
        await devPage.startCall();

        const [popOut, _] = await Promise.all([
            context.waitForEvent('page'),
            page.click('#calls-widget-expand-button'),
        ]);
        await expect(popOut.locator('#calls-expanded-view')).toBeVisible();
        await popOut.locator('#calls-popout-leave-button').click();
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

        await popOut.locator('#calls-popout-leave-button').click();
    });

    test('supports chat', async ({page, context}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.goto();
        await devPage.startCall();

        const [popOut, _] = await Promise.all([
            context.waitForEvent('page'),
            page.click('#calls-widget-expand-button'),
        ]);
        await expect(popOut.locator('#calls-expanded-view')).toBeVisible();

        await popOut.click('#calls-popout-chat-button button');

        await expect(popOut.locator('#sidebar-right [data-testid=call-thread]')).toBeVisible();

        const replyTextbox = popOut.locator('#reply_textbox');
        const msg = 'Hello World, first call thread reply';
        await replyTextbox.type(msg);
        await replyTextbox.press('Enter');
        await expect(popOut.locator(`p:has-text("${msg}")`)).toBeVisible();

        await popOut.click('#calls-popout-chat-button button');
        await expect(popOut.locator('#sidebar-right')).not.toBeVisible();

        await popOut.locator('#calls-popout-leave-button').click();
    });

    test('supports chat in a DM channel', async ({page, context}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.gotoDM(userState.users[0].username);
        await devPage.startCall();

        const [popOut, _] = await Promise.all([
            context.waitForEvent('page'),
            page.click('#calls-widget-expand-button'),
        ]);
        await expect(popOut.locator('#calls-expanded-view')).toBeVisible();

        await popOut.click('#calls-popout-chat-button button');

        await expect(popOut.locator('#sidebar-right [data-testid=call-thread]')).toBeVisible();

        const replyTextbox = popOut.locator('#reply_textbox');
        const msg = 'Hello World, first call thread reply';
        await replyTextbox.type(msg);
        await replyTextbox.press('Enter');
        await expect(popOut.locator(`p:has-text("${msg}")`)).toBeVisible();

        await popOut.click('#calls-popout-chat-button button');
        await expect(popOut.locator('#sidebar-right')).not.toBeVisible();

        await popOut.locator('#calls-popout-leave-button').click();
    });
});

