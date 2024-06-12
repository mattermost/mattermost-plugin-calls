import {expect, test} from '@playwright/test';

import PlaywrightDevPage from '../page';
import {getUserStoragesForTest} from '../utils';

test.beforeEach(async ({page}) => {
    const devPage = new PlaywrightDevPage(page);
    await devPage.goto();
});

test.describe('keyboard shortcuts', () => {
    test.use({storageState: getUserStoragesForTest()[0]});

    test('join/leave call', async ({page}) => {
        // Solely needed to wait till the page has loaded.
        await expect(page.locator('[aria-label="channel header region"] button:has-text("Start call")')).toBeVisible();

        if (process.platform === 'darwin') {
            await page.keyboard.press('Meta+Alt+S');
        } else {
            await page.keyboard.press('Control+Alt+S');
        }

        await expect(page.locator('#calls-widget')).toBeVisible();
        await expect(page.getByTestId('calls-widget-loading-overlay')).toBeHidden();

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

        const toggleMute = async () => {
            if (process.platform === 'darwin') {
                await page.keyboard.press('Meta+Shift+Space');
            } else {
                await page.keyboard.press('Control+Shift+Space');
            }
        };

        await toggleMute();

        let isMuted = await page.evaluate(() => {
            return !window.callsClient.audioTrack || !window.callsClient.audioTrack.enabled;
        });
        if (isMuted) {
            test.fail();
            return;
        }

        await toggleMute();

        isMuted = await page.evaluate(() => {
            return !window.callsClient.audioTrack || !window.callsClient.audioTrack.enabled;
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

        const toggleHand = async () => {
            if (process.platform === 'darwin') {
                await page.keyboard.press('Meta+Shift+Y');
            } else {
                await page.keyboard.press('Control+Shift+Y');
            }
        };

        await page.evaluate(() => {
            window.callsClient.on('raise_hand', () => {
                window.isHandRaised = true;
            });

            window.callsClient.on('lower_hand', () => {
                window.isHandRaised = false;
            });
        });

        await toggleHand();

        let isHandRaised = await page.evaluate(() => {
            return window.isHandRaised;
        });
        if (!isHandRaised) {
            test.fail();
            return;
        }

        await toggleHand();

        isHandRaised = await page.evaluate(() => {
            return window.isHandRaised;
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
            return !window.callsClient.audioTrack || !window.callsClient.audioTrack.enabled;
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
            return !window.callsClient.audioTrack || !window.callsClient.audioTrack.enabled;
        });
        if (!isMuted) {
            test.fail();
        }
    });
});
