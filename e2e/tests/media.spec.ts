import {test, expect, chromium} from '@playwright/test';

import {userState, baseURL, defaultTeam, pluginID} from '../constants';

import {getChannelNameForTest, startCall} from '../utils';

import PlaywrightDevPage from '../page';

test.beforeEach(async ({page, context}) => {
    const devPage = new PlaywrightDevPage(page);
    await devPage.goto();
});

test.describe('screen sharing', () => {
    test.use({storageState: userState.users[2].storageStatePath});

    test('share screen button', async ({page}) => {
        const userPage = await startCall(userState.users[3].storageStatePath);

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
        const userPage = await startCall(userState.users[3].storageStatePath);

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
});

test.describe('sending voice', () => {
    test.use({storageState: userState.users[2].storageStatePath});

    test('unmuting', async ({page}) => {
        const userPage = await startCall(userState.users[3].storageStatePath);

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
