import {readFile} from 'fs/promises';

import {test, expect, chromium} from '@playwright/test';

import PlaywrightDevPage from '../page';
import {userState} from '../constants';

test.beforeEach(async ({page, context}) => {
    const devPage = new PlaywrightDevPage(page);
    await devPage.goto();
});

test.describe('keyboard shortcuts', () => {
    test.use({storageState: userState.users[0].storageStatePath});

    test('join/leave call', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);

        // Solely needed to wait till the page has loaded.
        await expect(page.locator('[aria-label="channel header region"] button:has-text("Start Call")')).toBeVisible();

        await page.keyboard.down('Control');
        await page.keyboard.down('Shift');
        await page.keyboard.down('S');

        await expect(page.locator('#calls-widget')).toBeVisible();

        await page.keyboard.down('Control');
        await page.keyboard.down('Shift');
        await page.keyboard.down('L');

        await expect(page.locator('#calls-widget')).toBeHidden();
    });

    test('mute/unmute', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.startCall();
        await devPage.wait(1000);

        const toggleMute = async () => {
            await page.keyboard.down('Control');
            await page.keyboard.down('Shift');
            await page.keyboard.down('Space');
        };

        await toggleMute();

        let isMuted = await page.evaluate(() => {
            return window.callsClient.isMuted();
        });
        if (isMuted) {
            test.fail();
            return;
        }

        await toggleMute();

        isMuted = await page.evaluate(() => {
            return window.callsClient.isMuted();
        });
        if (!isMuted) {
            test.fail();
            return;
        }

        await devPage.leaveCall();
    });

    test('raise/lower hand', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.startCall();
        await devPage.wait(1000);

        const toggleHand = async () => {
            await page.keyboard.down('Control');
            await page.keyboard.down('Shift');
            await page.keyboard.down('Y');
        };

        await toggleHand();

        let isHandRaised = await page.evaluate(() => {
            return window.callsClient.isHandRaised;
        });
        if (!isHandRaised) {
            test.fail();
            return;
        }

        await toggleHand();

        isHandRaised = await page.evaluate(() => {
            return window.callsClient.isHandRaised;
        });
        if (isHandRaised) {
            test.fail();
            return;
        }

        await devPage.leaveCall();
    });

    test('participants list toggle', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.startCall();
        await devPage.wait(1000);

        const toggleParticipants = async () => {
            await page.keyboard.down('Control');
            await page.keyboard.down('Shift');
            await page.keyboard.down('P');
        };

        await expect(page.locator('#calls-widget-participants-list')).toBeHidden();

        await toggleParticipants();

        await expect(page.locator('#calls-widget-participants-list')).toBeVisible();

        await toggleParticipants();

        await expect(page.locator('#calls-widget-participants-list')).toBeHidden();

        await devPage.leaveCall();
    });

    test('accessibility conflict', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.startCall();
        await devPage.wait(1000);

        // unmute
        const muteButton = page.locator('#voice-mute-unmute');
        await expect(muteButton).toBeVisible();
        await muteButton.click();

        // open participants list
        await page.keyboard.press('Alt+P');

        const participantsList = page.locator('#calls-widget-participants-list');
        await expect(participantsList).toBeVisible();

        // should not mute
        await page.keyboard.press('Space');
        await expect(participantsList).toBeVisible();
        let isMuted = await page.evaluate(() => {
            return window.callsClient.isMuted();
        });
        if (isMuted) {
            test.fail();
            return;
        }

        // mute
        await page.keyboard.press('Control+Shift+Space');

        isMuted = await page.evaluate(() => {
            return window.callsClient.isMuted();
        });
        if (!isMuted) {
            test.fail();
        }
    });
});
