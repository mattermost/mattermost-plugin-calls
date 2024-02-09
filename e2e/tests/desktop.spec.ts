import {expect, test} from '@playwright/test';
import {readFile} from 'fs/promises';

import PlaywrightDevPage from '../page';
import type {DesktopAPICalls} from '../types';
import {
    getChannelNamesForTest,
    getUserStoragesForTest,
} from '../utils';

const userStorages = getUserStoragesForTest();

const desktopAPICalls: DesktopAPICalls = {
    getAppInfo: false,
    onCallsError: false,
    openScreenShareModal: false,
    onScreenShared: false,
    sendCallsError: false,
    leaveCall: false,
};

test.beforeEach(async ({page}, info) => {
    if (info.title.startsWith('desktopAPI')) {
        await page.exposeFunction('getAppInfo', () => {
            desktopAPICalls.getAppInfo = true;
            return {version: '5.7.0'};
        });

        await page.exposeFunction('onCallsError', () => {
            desktopAPICalls.onCallsError = true;
        });

        await page.exposeFunction('openScreenShareModal', () => {
            desktopAPICalls.openScreenShareModal = true;
        });

        await page.exposeFunction('onScreenShared', () => {
            desktopAPICalls.onScreenShared = true;
        });

        await page.exposeFunction('sendCallsError', () => {
            desktopAPICalls.sendCallsError = true;
        });

        await page.exposeFunction('leaveCall', () => {
            desktopAPICalls.leaveCall = true;
        });

        await page.addInitScript(() => {
            window.desktopAPI = {
                getAppInfo: window.getAppInfo,
                openScreenShareModal: window.openScreenShareModal,
                onCallsError: () => {
                    window.onCallsError();

                    return () => {}; // eslint-disable-line @typescript-eslint/no-empty-function
                },
                onScreenShared: () => {
                    window.onScreenShared();

                    return () => {}; // eslint-disable-line @typescript-eslint/no-empty-function
                },
                sendCallsError: window.sendCallsError,
                leaveCall: window.leaveCall,
            };
        });
    }

    const devPage = new PlaywrightDevPage(page);
    await devPage.goto();
});

test.describe('desktop', () => {
    test.use({storageState: userStorages[0]});

    test('screen sharing < 5.1.0', async ({page}) => {
        await page.evaluate(() => {
            window.desktop = {version: '5.0.0'};
        });
        const devPage = new PlaywrightDevPage(page);
        await devPage.startCall();
        await page.locator('#calls-widget-toggle-menu-button').click();
        await page.locator('#calls-widget-menu-screenshare').click();
        await expect(page.locator('#calls-screen-source-modal')).toBeHidden();
        await devPage.leaveCall();
    });

    test('screen source modal >= 5.1.0', async ({page}) => {
        const data = await readFile('./assets/screen.png', {encoding: 'base64'});
        const sourceURI = `data:image/png;base64,${data}`;
        await page.evaluate((thumbnailURL) => {
            window.desktop = {version: '5.1.0'};
            window.addEventListener('message', (event) => {
                if (event.data.type !== 'get-desktop-sources') {
                    return;
                }

                window.postMessage({
                    type: 'desktop-sources-result',
                    message: [
                        {id: '1', name: 'source_1', thumbnailURL},
                        {id: '2', name: 'source_2', thumbnailURL},
                        {id: '3', name: 'source_3', thumbnailURL},
                    ],
                },
                window.location.origin);
            });
        }, sourceURI);

        const devPage = new PlaywrightDevPage(page);
        await devPage.startCall();
        await page.locator('#calls-widget-toggle-menu-button').click();
        await page.locator('#calls-widget-menu-screenshare').click();
        await expect(page.locator('#calls-screen-source-modal')).toBeVisible();
        expect(await page.locator('#calls-screen-source-modal').screenshot()).toMatchSnapshot('calls-screen-source-modal.png');
        await page.locator('#calls-screen-source-modal button:has-text("source_2")').click();
        await page.locator('#calls-screen-source-modal button:has-text("Share")').click();
        await expect(page.locator('#calls-screen-source-modal')).toBeHidden();
        await devPage.leaveCall();
    });

    test('desktopAPI: screen sharing', async ({page}) => {
        await page.addInitScript(() => {
            window.desktopAPI.onScreenShared = (listener: (sourceID: string, withAudio: boolean) => void) => {
                window.desktopAPI.openScreenShareModal = () => {
                    window.openScreenShareModal();
                    listener('', false);
                };

                window.onScreenShared();

                return () => {}; // eslint-disable-line @typescript-eslint/no-empty-function
            };

            // Some browser API mocking needed given screen sharing is a little different
            // on Electron.

            // @ts-ignore
            navigator.mediaDevices.getUserMediaOriginal = navigator.mediaDevices.getUserMedia;
            navigator.mediaDevices.getUserMedia = (opts) => {
                if (opts?.audio) {
                    // @ts-ignore
                    return navigator.mediaDevices.getUserMediaOriginal({
                        video: false,
                        audio: true,
                    });
                }

                return navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: false,
                });
            };
        });

        // start call in global widget
        const devPage = new PlaywrightDevPage(page);
        await devPage.openWidget(getChannelNamesForTest()[0]);

        expect(desktopAPICalls.getAppInfo).toBe(true);
        expect(desktopAPICalls.onScreenShared).toBe(true);

        // click screen sharing button
        await page.locator('#calls-widget-toggle-menu-button').click();
        await page.locator('#calls-widget-menu-screenshare').click();

        expect(desktopAPICalls.openScreenShareModal).toBe(true);

        // verify we are screen sharing
        await expect(devPage.page.locator('#screen-player')).toBeVisible();

        await devPage.leaveCall();
    });

    test('desktopAPI: screen sharing permissions error', async ({page}) => {
        await page.addInitScript(() => {
            window.desktopAPI.onScreenShared = (listener: (sourceID: string, withAudio: boolean) => void) => {
                window.desktopAPI.openScreenShareModal = () => {
                    window.openScreenShareModal();
                    listener('', false);
                };

                window.onScreenShared();

                return () => {}; // eslint-disable-line @typescript-eslint/no-empty-function
            };
        });

        // start call in global widget
        const devPage = new PlaywrightDevPage(page);
        await devPage.openWidget(getChannelNamesForTest()[0]);

        expect(desktopAPICalls.getAppInfo).toBe(true);
        expect(desktopAPICalls.onScreenShared).toBe(true);

        // click screen sharing button
        await page.locator('#calls-widget-toggle-menu-button').click();
        await page.locator('#calls-widget-menu-screenshare').click();

        expect(desktopAPICalls.openScreenShareModal).toBe(true);

        // verify screen sharing is failing
        await expect(page.locator('#screen-player')).toBeHidden();
        await expect(page.getByTestId('calls-widget-banner-alert')).toBeVisible();

        await devPage.leaveCall();
    });

    test('desktopAPI: calls client error', async ({page}) => {
        // start call in global widget
        const devPage = new PlaywrightDevPage(page);
        await devPage.openWidget(getChannelNamesForTest()[0]);

        // Verify no error was sent
        expect(desktopAPICalls.sendCallsError).toBe(false);

        // Fake client failure
        await page.evaluate(() => {
            window.callsClient.disconnect(new Error('rtc peer error'));
        });

        await expect(devPage.page.locator('#calls-widget')).toBeHidden();

        // Verify error is getting sent
        expect(desktopAPICalls.sendCallsError).toBe(true);
    });

    test('desktopAPI: leave call', async ({page}) => {
        // start call in global widget
        const devPage = new PlaywrightDevPage(page);
        await devPage.openWidget(getChannelNamesForTest()[0]);
        await devPage.leaveCall();

        // Need to wait a moment since the the leave call happens in
        // a setTimeout handler.
        await devPage.wait(500);

        // Verify error is getting sent
        expect(desktopAPICalls.leaveCall).toBe(true);
    });
});
