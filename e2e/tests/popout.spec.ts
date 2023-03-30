import {test, expect} from '@playwright/test';

import PlaywrightDevPage from '../page';
import {userState} from '../constants';
import {getChannelNamesForTest, getUserIdxForTest} from '../utils';

const userIdx = getUserIdxForTest();

test.describe('popout window', () => {
    test.use({storageState: userState.users[userIdx].storageStatePath});

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
        await devPage.gotoDM(userState.users[userIdx + 1].username);
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
        await expect(popOut).toHaveTitle(`Call - ${getChannelNamesForTest()[0]}`);
        await expect(page).not.toHaveTitle(`Call - ${getChannelNamesForTest()[0]}`);

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
        await devPage.gotoDM(userState.users[userIdx + 1].username);
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

    test('recording banner dismissed works cross-window and is remembered - clicked on widget', async ({
        page,
        context,
    }) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.goto();
        await devPage.startCall();

        let [popOut, _] = await Promise.all([
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
        [popOut, _] = await Promise.all([
            context.waitForEvent('page'),
            page.click('#calls-widget-expand-button'),
        ]);
        await expect(popOut.locator('#calls-expanded-view')).toBeVisible();

        // prompt should not be visible, wait a couple seconds to make sure state has settled down
        await popOut.waitForTimeout(2000);
        await expect(popOut.getByTestId('banner-recording')).toBeHidden();

        // stop recording
        await popOut.locator('#calls-popout-record-button').click();

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
        await page.locator('#calls-widget-leave-button').click();
        await expect(page.locator('#calls-widget')).toBeHidden();
    });

    test('recording banner dismissed works cross-window and is remembered - clicked on popout', async ({
        page,
        context,
    }) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.goto();
        await devPage.startCall();

        let [popOut, _] = await Promise.all([
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
        [popOut, _] = await Promise.all([
            context.waitForEvent('page'),
            page.click('#calls-widget-expand-button'),
        ]);
        await expect(popOut.locator('#calls-expanded-view')).toBeVisible();

        // prompt should not be visible, wait a couple seconds to make sure state has settled down
        await popOut.waitForTimeout(2000);
        await expect(popOut.getByTestId('banner-recording')).toBeHidden();

        // stop recording
        await popOut.locator('#calls-popout-record-button').click();

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
        await page.locator('#calls-widget-leave-button').click();
        await expect(page.locator('#calls-widget')).toBeHidden();
    });
});
