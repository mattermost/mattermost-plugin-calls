import {readFile} from 'fs/promises';

import {test, expect, chromium} from '@playwright/test';

import PlaywrightDevPage from '../page';
import {userState} from '../constants';
import {getUserIdxForTest} from '../utils';

const userIdx = getUserIdxForTest();

test.beforeEach(async ({page, context}) => {
    const devPage = new PlaywrightDevPage(page);
    await devPage.goto();
});

test.describe('keyboard shortcuts', () => {
    test.use({storageState: userState.users[userIdx].storageStatePath});

    test('join/leave call', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);

        // Solely needed to wait till the page has loaded.
        await expect(page.locator('[aria-label="channel header region"] button:has-text("Start call")')).toBeVisible();

        if (process.platform === 'darwin') {
            await page.keyboard.press('Meta+Alt+S');
        } else {
            await page.keyboard.press('Control+Alt+S');
        }

        await expect(page.locator('#calls-widget')).toBeVisible();

        if (process.platform === 'darwin') {
            await page.keyboard.press('Meta+Shift+L');
        } else {
            await page.keyboard.press('Control+Shift+L');
        }

        await expect(page.locator('#calls-widget')).toBeHidden();
    });

    test('mute/unmute', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.startCall();
        await devPage.wait(1000);

        const toggleMute = async () => {
            if (process.platform === 'darwin') {
                await page.keyboard.press('Meta+Shift+Space');
            } else {
                await page.keyboard.press('Control+Shift+Space');
            }
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
            if (process.platform === 'darwin') {
                await page.keyboard.press('Meta+Shift+Y');
            } else {
                await page.keyboard.press('Control+Shift+Y');
            }
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
            if (process.platform === 'darwin') {
                await page.keyboard.press('Meta+Shift+P');
            } else {
                await page.keyboard.press('Control+Shift+P');
            }
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
        if (process.platform === 'darwin') {
            await page.keyboard.press('Meta+Shift+Space');
        } else {
            await page.keyboard.press('Control+Shift+Space');
        }

        isMuted = await page.evaluate(() => {
            return window.callsClient.isMuted();
        });
        if (!isMuted) {
            test.fail();
        }
    });
});
