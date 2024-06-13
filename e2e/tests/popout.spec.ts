import {expect, test} from '@playwright/test';

import PlaywrightDevPage from '../page';
import {getChannelNamesForTest, getUserStoragesForTest, startCallAndPopout} from '../utils';

const userStorages = getUserStoragesForTest();

test.describe('popout window', () => {
    test.use({storageState: userStorages[0]});

    test('popout opens muted', async () => {
        const [page, popOut] = await startCallAndPopout(userStorages[0]);
        await expect(popOut.page.locator('#calls-expanded-view')).toBeVisible();
        expect(await popOut.page.locator('#calls-expanded-view-participants-grid').screenshot()).toMatchSnapshot('expanded-view-participants-grid.png');
        expect(await popOut.page.locator('#calls-expanded-view-controls').screenshot()).toMatchSnapshot('expanded-view-controls.png');
        await expect(popOut.page.locator('#calls-popout-mute-button')).toBeVisible();
        await expect(popOut.page.getByTestId('calls-popout-muted')).toBeVisible();
        await popOut.leaveFromPopout();
        await expect(page.page.locator('#calls-widget')).toBeHidden();
    });

    test('popout opens in a DM channel', async () => {
        const [_, popOut] = await startCallAndPopout(userStorages[0]);
        await expect(popOut.page.locator('#calls-expanded-view')).toBeVisible();
        await popOut.leaveFromPopout();
    });

    test('window title matches', async () => {
        const [page, popOut] = await startCallAndPopout(userStorages[0]);
        await expect(popOut.page.locator('#calls-expanded-view')).toBeVisible();
        await expect(popOut.page).toHaveTitle(`Call - ${getChannelNamesForTest()[0]}`);
        await expect(page.page).not.toHaveTitle(`Call - ${getChannelNamesForTest()[0]}`);
        await popOut.leaveFromPopout();
        await expect(page.page.locator('#calls-widget')).toBeHidden();
    });

    test('supports chat', async () => {
        const [page, popOut] = await startCallAndPopout(userStorages[0]);
        await expect(popOut.page.locator('#calls-expanded-view')).toBeVisible();

        await popOut.page.click('#calls-popout-chat-button');

        await expect(popOut.page.locator('#sidebar-right [data-testid=call-thread]')).toBeVisible();

        const replyTextbox = popOut.page.locator('#reply_textbox');
        const msg = 'Hello World, first call thread reply';
        await replyTextbox.type(msg);
        await replyTextbox.press('Enter');
        await expect(popOut.page.locator(`p:has-text("${msg}")`)).toBeVisible();

        await popOut.page.click('#calls-popout-chat-button');
        await expect(popOut.page.locator('#sidebar-right')).not.toBeVisible();

        await popOut.leaveFromPopout();
        await expect(page.page.locator('#calls-widget')).toBeHidden();
    });

    test('supports chat in a DM channel', async () => {
        const [page, popOut] = await startCallAndPopout(userStorages[0]);
        await expect(popOut.page.locator('#calls-expanded-view')).toBeVisible();

        await popOut.page.click('#calls-popout-chat-button');

        await expect(popOut.page.locator('#sidebar-right [data-testid=call-thread]')).toBeVisible();

        const replyTextbox = popOut.page.locator('#reply_textbox');
        const msg = 'Hello World, first call thread reply';
        await replyTextbox.type(msg);
        await replyTextbox.press('Enter');
        await expect(popOut.page.locator(`p:has-text("${msg}")`)).toBeVisible();

        await popOut.page.click('#calls-popout-chat-button');
        await expect(popOut.page.locator('#sidebar-right')).not.toBeVisible();

        await popOut.leaveFromPopout();
        await expect(page.page.locator('#calls-widget')).toBeHidden();
    });

    test('expanding chat', async () => {
        const [page, popOut] = await startCallAndPopout(userStorages[0]);
        await expect(popOut.page.locator('#calls-expanded-view')).toBeVisible();

        // Open chat thread
        await popOut.page.click('#calls-popout-chat-button');
        await expect(popOut.page.locator('#sidebar-right [data-testid=call-thread]')).toBeVisible();

        // Expand call thread
        await popOut.page.locator('[aria-label="Expand"]').click();

        // Verify leave button can be clicked. Checking for visibility would work even
        // if there's an element showing on top
        await popOut.page.locator('#calls-popout-leave-button').click();
        await popOut.page.getByText('Leave call').click();

        await expect(page.page.locator('#calls-widget')).toBeHidden();
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

        // stop recording confirmation
        await expect(popOut2.locator('#stop_recording_confirmation')).toBeVisible();
        await popOut2.getByTestId('modal-confirm-button').click();

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
        await devPage.leaveFromWidget();
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

        // stop recording confirmation
        await expect(popOut2.locator('#stop_recording_confirmation')).toBeVisible();
        await popOut2.getByTestId('modal-confirm-button').click();

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
        await devPage.leaveFromWidget();
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
        await devPage.leaveFromWidget();
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
