import {readFile} from 'fs/promises';

import {test, expect, chromium} from '@playwright/test';

import PlaywrightDevPage from '../page';
import {userState} from '../constants';

declare global {
    interface Window {
        callsClient: any,
        desktop: any,
    }
}

test.beforeEach(async ({page, context}) => {
    const devPage = new PlaywrightDevPage(page);
    await devPage.goto();
});

test.describe('start/join call in channel with calls disabled', () => {
    test.use({storageState: userState.admin.storageStatePath});

    test('/call start', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.disableCalls();

        await page.locator('#post_textbox').fill('/call start');
        await page.locator('[data-testid=SendMessageButton]').click();
        await expect(page.locator('#calls-widget')).toBeHidden();
        await expect(page.locator('#create_post div.has-error label')).toBeVisible();
        const text = await page.textContent('#create_post div.has-error label');
        expect(text).toBe('Cannot start or join call: calls are disabled in this channel.');

        await devPage.enableCalls();
    });

    test('/call join', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.disableCalls();

        await page.locator('#post_textbox').fill('/call join');
        await page.locator('[data-testid=SendMessageButton]').click();
        await expect(page.locator('#calls-widget')).toBeHidden();
        await expect(page.locator('#create_post div.has-error label')).toBeVisible();
        const text = await page.textContent('#create_post div.has-error label');
        expect(text).toBe('Cannot start or join call: calls are disabled in this channel.');

        await devPage.enableCalls();
    });
});

test.describe('start new call', () => {
    test.use({storageState: userState.users[0].storageStatePath});

    test('channel header button', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.startCall();
        await devPage.wait(1000);
        expect(await page.locator('#calls-widget .calls-widget-bottom-bar').screenshot()).toMatchSnapshot('calls-widget-bottom-bar.png');
        await devPage.leaveCall();
    });

    test('slash command', async ({page, context}) => {
        await page.locator('#post_textbox').fill('/call join');
        await page.locator('[data-testid=SendMessageButton]').click();
        await expect(page.locator('#calls-widget')).toBeVisible();
        await page.locator('#post_textbox').fill('/call leave');
        await page.locator('[data-testid=SendMessageButton]').click();
        await expect(page.locator('#calls-widget')).toBeHidden();
    });

    test('dm channel', async ({page, context}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.gotoDM(userState.users[1].username);
        await devPage.startCall();
        await devPage.wait(1000);
        expect(await page.locator('#calls-widget .calls-widget-bottom-bar').screenshot()).toMatchSnapshot('dm-calls-widget-bottom-bar.png');
        await devPage.leaveCall();
    });

    test('verify no one is talking', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.startCall();
        await devPage.wait(1000);

        expect(await page.locator())

        await expect(page.locator('#calls-widget').filter({has: page.getByText('No one is talking...')})).toBeVisible();

        await devPage.leaveCall();
    });
});

test.describe('desktop', () => {
    test.use({storageState: userState.users[0].storageStatePath});

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
        await devPage.wait(1000);
        expect(await page.locator('#calls-screen-source-modal').screenshot()).toMatchSnapshot('calls-screen-source-modal.png');
        await page.locator('#calls-screen-source-modal button:has-text("source_2")').click();
        await page.locator('#calls-screen-source-modal button:has-text("Share")').click();
        await expect(page.locator('#calls-screen-source-modal')).toBeHidden();
        await devPage.leaveCall();
    });
});

test.describe('auto join link', () => {
    test.use({storageState: userState.users[0].storageStatePath});

    test('public channel', async ({page, context}) => {
        await page.locator('#post_textbox').fill('/call link');
        await page.locator('[data-testid=SendMessageButton]').click();

        const post = page.locator('.post-message__text').last();
        await expect(post).toBeVisible();

        const content = await post.textContent();
        if (!content) {
            test.fail();
            return;
        }
        const link = content.replace('Call link: ', '');
        page.goto(link);

        expect(page.locator('#calls-widget .calls-widget-bottom-bar'));
        await page.locator('#calls-widget-leave-button').click();
        await expect(page.locator('#calls-widget')).toBeHidden();
    });

    test('dm channel', async ({page, context}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.gotoDM(userState.users[1].username);

        await page.locator('#post_textbox').fill('/call link');
        await page.locator('[data-testid=SendMessageButton]').click();

        const post = page.locator('.post-message__text').last();
        await expect(post).toBeVisible();

        const content = await post.textContent();
        if (!content) {
            test.fail();
            return;
        }
        const link = content.replace('Call link: ', '');
        page.goto(link);

        expect(page.locator('#calls-widget .calls-widget-bottom-bar'));
        await page.locator('#calls-widget-leave-button').click();
        await expect(page.locator('#calls-widget')).toBeHidden();
    });
});

test.describe('setting audio input device', () => {
    test.use({storageState: userState.users[0].storageStatePath});

    test('no default', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.startCall();
        await devPage.wait(1000);

        const currentAudioInputDevice = await page.evaluate(() => {
            return window.callsClient.currentAudioInputDevice?.deviceId;
        });
        if (currentAudioInputDevice) {
            test.fail();
            return;
        }

        await devPage.leaveCall();
    });

    test('setting default', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.startCall();
        await devPage.wait(1000);

        await page.locator('#calls-widget-toggle-menu-button').click();
        await expect(page.locator('#calls-widget-audio-input-button')).toBeVisible();
        await page.locator('#calls-widget-audio-input-button').click();
        await expect(page.locator('#calls-widget-audio-inputs-menu')).toBeVisible();

        let currentAudioInputDevice = await page.evaluate(() => {
            return window.callsClient.currentInputAudioDevice?.deviceId;
        });
        if (currentAudioInputDevice) {
            test.fail();
            return;
        }

        await page.locator('#calls-widget-audio-inputs-menu button:has-text("Fake Audio Input 1")').click();
        await expect(page.locator('#calls-widget-audio-inputs-menu')).toBeHidden();

        currentAudioInputDevice = await page.evaluate(() => {
            return window.callsClient.currentAudioInputDevice?.deviceId;
        });
        if (!currentAudioInputDevice) {
            test.fail();
            return;
        }

        await devPage.leaveCall();

        await devPage.startCall();
        await devPage.wait(1000);

        const currentAudioInputDevice2 = await page.evaluate(() => {
            return window.callsClient.currentAudioInputDevice?.deviceId;
        });
        if (currentAudioInputDevice2 !== currentAudioInputDevice) {
            test.fail();
            return;
        }

        await devPage.leaveCall();

        await page.reload();
        const deviceID = await page.evaluate(() => {
            return window.localStorage.getItem('calls_default_audio_input');
        });
        if (!deviceID) {
            test.fail();
        }
    });
});

test.describe('setting audio output device', () => {
    test.use({storageState: userState.users[0].storageStatePath});

    test('no default', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.startCall();
        await devPage.wait(1000);

        const currentAudioOutputDevice = await page.evaluate(() => {
            return window.callsClient.currentAudioOutputDevice?.deviceId;
        });
        if (currentAudioOutputDevice) {
            test.fail();
            return;
        }

        await devPage.leaveCall();
    });

    test('setting default', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.startCall();
        await devPage.wait(1000);

        await page.locator('#calls-widget-toggle-menu-button').click();
        await expect(page.locator('#calls-widget-audio-output-button')).toBeVisible();
        await page.locator('#calls-widget-audio-output-button').click();
        await expect(page.locator('#calls-widget-audio-outputs-menu')).toBeVisible();

        let currentAudioOutputDevice = await page.evaluate(() => {
            return window.callsClient.currentAudioOutputDevice?.deviceId;
        });
        if (currentAudioOutputDevice) {
            test.fail();
            return;
        }

        await page.locator('#calls-widget-audio-outputs-menu button:has-text("Fake Audio Output 1")').click();
        await expect(page.locator('#calls-widget-audio-outputs-menu')).toBeHidden();

        currentAudioOutputDevice = await page.evaluate(() => {
            return window.callsClient.currentAudioOutputDevice?.deviceId;
        });
        if (!currentAudioOutputDevice) {
            test.fail();
            return;
        }

        await devPage.leaveCall();

        await devPage.startCall();
        await devPage.wait(1000);

        const currentAudioOutputDevice2 = await page.evaluate(() => {
            return window.callsClient.currentAudioOutputDevice?.deviceId;
        });
        if (currentAudioOutputDevice2 !== currentAudioOutputDevice) {
            test.fail();
            return;
        }

        await devPage.leaveCall();

        await page.reload();
        const deviceID = await page.evaluate(() => {
            return window.localStorage.getItem('calls_default_audio_output');
        });
        if (!deviceID) {
            test.fail();
        }
    });
});

test.describe('switching products', () => {
    test.use({storageState: userState.users[0].storageStatePath});

    test('boards', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.startCall();
        await devPage.wait(1000);

        const switchProductsButton = devPage.page.locator('h1', {hasText: 'Channels'});
        await expect(switchProductsButton).toBeVisible();
        await switchProductsButton.click();

        const boardsButton = devPage.page.locator('#product-switcher-menu-dropdown div', {hasText: 'Boards'});
        await expect(boardsButton).toBeVisible();
        await boardsButton.click();

        await expect(devPage.page.locator('#calls-widget')).toBeVisible();

        await devPage.page.locator('#calls-widget-participants-button').click();
        const participantsList = devPage.page.locator('#calls-widget-participants-menu');
        await expect(participantsList).toBeVisible();
        expect(await participantsList.screenshot()).toMatchSnapshot('calls-widget-participants-list-boards.png');

        await devPage.leaveCall();
    });
});
