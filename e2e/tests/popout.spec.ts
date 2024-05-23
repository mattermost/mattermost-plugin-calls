import {expect, test} from '@playwright/test';

import PlaywrightDevPage from '../page';
import {getChannelNamesForTest, getUsernamesForTest, getUserStoragesForTest} from '../utils';

const userStorages = getUserStoragesForTest();
const usernames = getUsernamesForTest();

test.describe('popout window', () => {
    test.use({storageState: userStorages[0]});

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
        await devPage.gotoDM(usernames[1]);
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

        await popOut.click('#calls-popout-chat-button');

        await expect(popOut.locator('#sidebar-right [data-testid=call-thread]')).toBeVisible();

        const replyTextbox = popOut.locator('#reply_textbox');
        const msg = 'Hello World, first call thread reply';
        await replyTextbox.type(msg);
        await replyTextbox.press('Enter');
        await expect(popOut.locator(`p:has-text("${msg}")`)).toBeVisible();

        await popOut.click('#calls-popout-chat-button');
        await expect(popOut.locator('#sidebar-right')).not.toBeVisible();

        await popOut.locator('#calls-popout-leave-button').click();
    });

    test('supports chat in a DM channel', async ({page, context}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.gotoDM(usernames[1]);
        await devPage.startCall();

        const [popOut, _] = await Promise.all([
            context.waitForEvent('page'),
            page.click('#calls-widget-expand-button'),
        ]);
        await expect(popOut.locator('#calls-expanded-view')).toBeVisible();

        await popOut.click('#calls-popout-chat-button');

        await expect(popOut.locator('#sidebar-right [data-testid=call-thread]')).toBeVisible();

        const replyTextbox = popOut.locator('#reply_textbox');
        const msg = 'Hello World, first call thread reply';
        await replyTextbox.type(msg);
        await replyTextbox.press('Enter');
        await expect(popOut.locator(`p:has-text("${msg}")`)).toBeVisible();

        await popOut.click('#calls-popout-chat-button');
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

        const [popOut] = await Promise.all([
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
        await page.getByTestId('calls-widget-banner-close').click();
        await expect(page.getByTestId('calls-widget-banner-recording')).toBeHidden();

        // should close prompt on popout as well
        await expect(popOut.getByTestId('banner-recording')).toBeHidden();

        // close and reopen popout
        await popOut.close();
        await expect(popOut.isClosed()).toBeTruthy();
        const [popOut2] = await Promise.all([
            context.waitForEvent('page'),
            page.click('#calls-widget-expand-button'),
        ]);
        await expect(popOut2.locator('#calls-expanded-view')).toBeVisible();

        await expect(popOut2.getByTestId('banner-recording')).toBeHidden();

        // stop recording
        await popOut2.locator('#calls-popout-record-button').click();

        // verify recording ended prompt renders correctly on widget and in popout
        await expect(popOut2.getByTestId('banner-recording-stopped')).toBeVisible();
        await expect(popOut2.getByTestId('banner-recording-stopped')).toContainText('Recording has stopped. Processing…');
        await expect(page.getByTestId('calls-widget-banner-recording')).toBeVisible();
        await expect(page.getByTestId('calls-widget-banner-recording')).toContainText('Recording has stopped. Processing…');

        // close prompt on widget
        await page.getByTestId('calls-widget-banner-close').click();
        await expect(page.getByTestId('calls-widget-banner-recording')).toBeHidden();

        // should close prompt on popout as well
        await expect(popOut2.getByTestId('banner-recording-stopped')).toBeHidden();

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

        const [popOut] = await Promise.all([
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
        await popOut.getByTestId('popout-prompt-close').click();
        await expect(popOut.getByTestId('banner-recording')).toBeHidden();

        // should close prompt on widget as well
        await expect(page.getByTestId('calls-widget-banner-recording')).toBeHidden();

        // close and reopen popout
        await popOut.close();
        await expect(popOut.isClosed()).toBeTruthy();
        const [popOut2] = await Promise.all([
            context.waitForEvent('page'),
            page.click('#calls-widget-expand-button'),
        ]);
        await expect(popOut2.locator('#calls-expanded-view')).toBeVisible();

        await expect(popOut2.getByTestId('banner-recording')).toBeHidden();

        // stop recording
        await popOut2.locator('#calls-popout-record-button').click();

        // verify recording ended prompt renders correctly on widget and in popout
        await expect(page.getByTestId('calls-widget-banner-recording')).toBeVisible();
        await expect(page.getByTestId('calls-widget-banner-recording')).toContainText('Recording has stopped. Processing…');
        await expect(popOut2.getByTestId('banner-recording-stopped')).toBeVisible();
        await expect(popOut2.getByTestId('banner-recording-stopped')).toContainText('Recording has stopped. Processing…');

        // close prompt on popout
        await popOut2.getByTestId('popout-prompt-close').click();
        await expect(popOut2.getByTestId('banner-recording-stopped')).toBeHidden();

        // should close prompt on widget as well
        await expect(page.getByTestId('calls-widget-banner-recording')).toBeHidden();

        // leave call
        await page.locator('#calls-widget-leave-button').click();
        await expect(page.locator('#calls-widget')).toBeHidden();
    });

    test('/call leave slash command', async ({page, context}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.goto();
        await devPage.startCall();

        const [popOut, _] = await Promise.all([
            context.waitForEvent('page'),
            page.click('#calls-widget-expand-button'),
        ]);
        await expect(popOut.locator('#calls-expanded-view')).toBeVisible();

        await popOut.click('#calls-popout-chat-button');

        await expect(popOut.locator('#sidebar-right [data-testid=call-thread]')).toBeVisible();

        await popOut.locator('#reply_textbox').fill('/call leave ');
        await popOut.getByTestId('SendMessageButton').click();

        // Verify we left the call.
        await expect(page.locator('#calls-widget')).toBeHidden();
        await expect(popOut.isClosed()).toEqual(true);
    });

    test('webapp ws reconnect', async ({page, context}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.goto();
        await devPage.startCall();

        const [popOut, _] = await Promise.all([
            context.waitForEvent('page'),
            page.click('#calls-widget-expand-button'),
        ]);
        await expect(popOut.locator('#calls-expanded-view')).toBeVisible();

        // Trigger ws disconnect.
        await popOut.evaluate(() => {
            const wsClient = window.plugins['com.mattermost.calls'].wsClient;
            wsClient.conn.close();
        });

        // Wait a few seconds to let the reconnect handler run.
        await devPage.wait(5000);

        // Make sure participants are visibile.
        await expect(popOut.locator('#calls-expanded-view')).toBeVisible();
        expect(await popOut.locator('#calls-expanded-view-participants-grid').screenshot()).toMatchSnapshot('expanded-view-participants-grid.png');

        // leave call
        await page.locator('#calls-widget-leave-button').click();
        await expect(page.locator('#calls-widget')).toBeHidden();
    });
});

test.describe('popout window - reactions', () => {
    test.use({storageState: userStorages[0]});

    test('raising hand', async ({page, context}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.goto();
        await devPage.startCall();

        const [popOut, _] = await Promise.all([
            context.waitForEvent('page'),
            page.click('#calls-widget-expand-button'),
        ]);
        await expect(popOut.locator('#calls-popout-emoji-picker-button')).toBeVisible();

        await popOut.locator('#calls-popout-emoji-picker-button').click();

        await expect(popOut.getByTestId('raise-hand-button')).toBeVisible();
        await popOut.getByTestId('raise-hand-button').click();
        await expect(popOut.getByTestId('lower-hand-button')).toBeVisible();
        await popOut.getByTestId('lower-hand-button').click();
        await expect(popOut.getByTestId('raise-hand-button')).toBeVisible();
    });

    test('quick reaction', async ({page, context}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.goto();
        await devPage.startCall();

        const [popOut, _] = await Promise.all([
            context.waitForEvent('page'),
            page.click('#calls-widget-expand-button'),
        ]);
        await expect(popOut.locator('#calls-popout-emoji-picker-button')).toBeVisible();

        // Open reaction bar
        await popOut.locator('#calls-popout-emoji-picker-button').click();

        // Verify the reactions bar is visibile and the full reaction picker is not
        await expect(popOut.locator('#calls-popout-emoji-bar')).toBeVisible();
        await expect(popOut.locator('#calls-popout-emoji-picker')).toBeHidden();

        // Quick react
        await popOut.locator('span.emoticon').first().click();

        // Verify that reacting closes the bar
        await expect(popOut.locator('#calls-popout-emoji-bar')).toBeHidden();
        await expect(popOut.locator('#calls-popout-emoji-picker')).toBeHidden();

        // Open reaction bar
        await popOut.locator('#calls-popout-emoji-picker-button').click();

        // Verify the reactions bar is visibile and the full reaction picker is not
        await expect(popOut.locator('#calls-popout-emoji-bar')).toBeVisible();
        await expect(popOut.locator('#calls-popout-emoji-picker')).toBeHidden();

        // Press Escape
        await popOut.keyboard.press('Escape');

        // Verify that hitting Escape key closes it
        await expect(popOut.locator('#calls-popout-emoji-bar')).toBeHidden();
        await expect(popOut.locator('#calls-popout-emoji-picker')).toBeHidden();

        // Open reaction bar
        await popOut.locator('#calls-popout-emoji-picker-button').click();

        // Verify the reactions bar is visibile and the full reaction picker is not
        await expect(popOut.locator('#calls-popout-emoji-bar')).toBeVisible();
        await expect(popOut.locator('#calls-popout-emoji-picker')).toBeHidden();

        // Click outside
        await popOut.locator('#calls-expanded-view').click({force: true, position: {x: 0, y: 0}});

        // Verify that clicking outside closes it
        await expect(popOut.locator('#calls-popout-emoji-bar')).toBeHidden();
        await expect(popOut.locator('#calls-popout-emoji-picker')).toBeHidden();
    });

    test('reaction picker', async ({page, context}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.goto();
        await devPage.startCall();

        const [popOut, _] = await Promise.all([
            context.waitForEvent('page'),
            page.click('#calls-widget-expand-button'),
        ]);
        await expect(popOut.locator('#calls-popout-emoji-picker-button')).toBeVisible();

        // Open reaction bar
        await popOut.locator('#calls-popout-emoji-picker-button').click();
        await expect(popOut.locator('#calls-popout-emoji-bar')).toBeVisible();

        // Open reaction picker
        await popOut.locator('i.icon-emoticon-plus-outline').click();
        await expect(popOut.locator('#calls-popout-emoji-picker')).toBeVisible();

        // Pick a reaction
        await popOut.locator('button.epr-visible').first().click();

        // Verify that reacting closes both the bar and picker
        await expect(popOut.locator('#calls-popout-emoji-bar')).toBeHidden();
        await expect(popOut.locator('#calls-popout-emoji-picker')).toBeHidden();

        // Open reaction bar
        await popOut.locator('#calls-popout-emoji-picker-button').click();
        await expect(popOut.locator('#calls-popout-emoji-bar')).toBeVisible();

        // Open reaction picker
        await popOut.locator('i.icon-emoticon-plus-outline').click();
        await expect(popOut.locator('#calls-popout-emoji-picker')).toBeVisible();

        // Press Escape
        await popOut.keyboard.press('Escape');

        // Verify that hitting Escape key closes everything
        await expect(popOut.locator('#calls-popout-emoji-bar')).toBeHidden();
        await expect(popOut.locator('#calls-popout-emoji-picker')).toBeHidden();

        // Open reaction bar
        await popOut.locator('#calls-popout-emoji-picker-button').click();
        await expect(popOut.locator('#calls-popout-emoji-bar')).toBeVisible();

        // Open reaction picker
        await popOut.locator('i.icon-emoticon-plus-outline').click();
        await expect(popOut.locator('#calls-popout-emoji-picker')).toBeVisible();

        // Click outside
        await popOut.locator('#calls-expanded-view').click({force: true, position: {x: 0, y: 0}});

        // Verify that clicking outside closes everything
        await expect(popOut.locator('#calls-popout-emoji-bar')).toBeHidden();
        await expect(popOut.locator('#calls-popout-emoji-picker')).toBeHidden();
    });
});
