import {chromium, expect, test} from '@playwright/test';

import {baseURL, defaultTeam, pluginID} from '../constants';
import PlaywrightDevPage from '../page';
import {getUserStoragesForTest, startCall} from '../utils';

const userStorages = getUserStoragesForTest();

test.beforeEach(async ({page, context}) => {
    const devPage = new PlaywrightDevPage(page);
    await devPage.goto();
});

test.describe('screen sharing', () => {
    test.use({storageState: userStorages[0]});

    test('share screen button', async ({page}) => {
        const userPage = await startCall(userStorages[1]);

        const devPage = new PlaywrightDevPage(page);
        await devPage.joinCall();

        await page.locator('#calls-widget-toggle-menu-button').click();
        await page.locator('#calls-widget-menu-screenshare').click();

        await expect(page.locator('#screen-player')).toBeVisible();
        await expect(userPage.page.locator('#screen-player')).toBeVisible();

        await devPage.wait(1000);

        const screenStreamID = await userPage.page.evaluate(() => {
            return window.callsClient.getRemoteScreenStream()?.getVideoTracks()[0]?.id;
        });

        expect(screenStreamID).toContain('screen_');

        await page.getByTestId('calls-widget-stop-screenshare').click();

        await expect(page.locator('#screen-player')).toBeHidden();
        await expect(userPage.page.locator('#screen-player')).toBeHidden();

        await devPage.leaveCall();
        await userPage.leaveCall();
    });

    test('share screen keyboard shortcut', async ({page}) => {
        const userPage = await startCall(userStorages[1]);

        const devPage = new PlaywrightDevPage(page);
        await devPage.joinCall();

        await devPage.wait(1000);

        if (process.platform === 'darwin') {
            await page.keyboard.press('Meta+Shift+E');
        } else {
            await page.keyboard.press('Control+Shift+E');
        }

        await expect(page.locator('#screen-player')).toBeVisible();
        await expect(userPage.page.locator('#screen-player')).toBeVisible();

        await devPage.wait(1000);

        const screenTrackID = await userPage.page.evaluate(() => {
            return window.callsClient.getRemoteScreenStream()?.getVideoTracks()[0]?.id;
        });

        expect(screenTrackID).toContain('screen_');

        if (process.platform === 'darwin') {
            await page.keyboard.press('Meta+Shift+E');
        } else {
            await page.keyboard.press('Control+Shift+E');
        }

        await expect(page.locator('#screen-player')).toBeHidden();
        await expect(userPage.page.locator('#screen-player')).toBeHidden();

        await devPage.leaveCall();
        await userPage.leaveCall();
    });

    test('presenter leaving and joining back', async ({page}) => {
        const userPage = await startCall(userStorages[1]);

        const devPage = new PlaywrightDevPage(page);
        await devPage.joinCall();

        // presenter starts sharing
        await page.locator('#calls-widget-toggle-menu-button').click();
        await page.locator('#calls-widget-menu-screenshare').click();

        // verify that on both sides the screen sharing player is rendered
        await expect(page.locator('#screen-player')).toBeVisible();
        await expect(userPage.page.locator('#screen-player')).toBeVisible();

        await devPage.wait(1000);

        // verify that on the receiving side the screen track is correctly set
        let screenStreamID = await userPage.page.evaluate(() => {
            return window.callsClient.getRemoteScreenStream()?.getVideoTracks()[0]?.id;
        });
        expect(screenStreamID).toContain('screen_');

        // presenter leaves call
        await devPage.leaveCall();

        // here we switch roles, previous presenter will now be receiving
        await devPage.joinCall();

        // the other participant shares screen
        await userPage.page.locator('#calls-widget-toggle-menu-button').click();
        await userPage.page.locator('#calls-widget-menu-screenshare').click();

        // verify that on both sides the screen sharing player is rendered
        await expect(userPage.page.locator('#screen-player')).toBeVisible();
        await expect(devPage.page.locator('#screen-player')).toBeVisible();

        await userPage.wait(1000);

        // verify that on the receiving side the screen track is correctly set
        screenStreamID = await devPage.page.evaluate(() => {
            return window.callsClient.getRemoteScreenStream()?.getVideoTracks()[0]?.id;
        });
        expect(screenStreamID).toContain('screen_');

        await devPage.leaveCall();
        await userPage.leaveCall();
    });
});

test.describe('sending voice', () => {
    test.use({storageState: userStorages[0]});

    test('unmuting', async ({page}) => {
        const userPage = await startCall(userStorages[1]);

        const devPage = new PlaywrightDevPage(page);
        await devPage.joinCall();

        await page.locator('#voice-mute-unmute').click();

        await devPage.wait(1000);

        let voiceTrackID = await userPage.page.evaluate(() => {
            return window.callsClient.streams[1]?.getAudioTracks()[0]?.id;
        });

        await expect(userPage.page.getByTestId(voiceTrackID)).toBeHidden();
        await expect(userPage.page.getByTestId(voiceTrackID)).toHaveAttribute('autoplay', '');

        await userPage.page.locator('#voice-mute-unmute').click();

        await devPage.wait(1000);

        voiceTrackID = await page.evaluate(() => {
            return window.callsClient.streams[1]?.getAudioTracks()[0]?.id;
        });

        await expect(page.getByTestId(voiceTrackID)).toBeHidden();
        await expect(page.getByTestId(voiceTrackID)).toHaveAttribute('autoplay', '');

        await devPage.leaveCall();
        await userPage.leaveCall();
    });
});
