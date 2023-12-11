import {expect, test} from '@playwright/test';
import {readFile} from 'fs/promises';

import {adminState} from '../constants';
import PlaywrightDevPage from '../page';
import {
    getChannelNamesForTest,
    getChannelURL,
    getUserIdxForTest,
    getUsernamesForTest,
    getUserStoragesForTest,
} from '../utils';

const userStorages = getUserStoragesForTest();
const usernames = getUsernamesForTest();

test.beforeEach(async ({page, context}, info) => {
    // Small optimization to avoid loading an unnecessary channel.
    if (info.title === 'system console') {
        return;
    }
    const devPage = new PlaywrightDevPage(page);
    await devPage.goto();
});

test.describe('start/join call in channel with calls disabled', () => {
    test.use({storageState: adminState.storageStatePath});

    test('/call start', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.disableCalls();

        await page.locator('#post_textbox').fill('/call start');
        await page.getByTestId('SendMessageButton').click();
        await expect(page.locator('#calls-widget')).toBeHidden();

        await expect(page.locator('#calls_generic_error').filter({has: page.getByText('Calls are disabled in this channel.')})).toBeVisible();
        await page.keyboard.press('Escape');

        await devPage.enableCalls();
    });

    test('/call join', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.disableCalls();

        await page.locator('#post_textbox').fill('/call join');
        await page.getByTestId('SendMessageButton').click();
        await expect(page.locator('#calls-widget')).toBeHidden();

        await expect(page.locator('#calls_generic_error').filter({has: page.getByText('Calls are disabled in this channel.')})).toBeVisible();
        await page.keyboard.press('Escape');

        await devPage.enableCalls();
    });
});

test.describe('start new call', () => {
    test.use({storageState: userStorages[0]});

    test('channel header button', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.startCall();
        expect(await page.locator('#calls-widget .calls-widget-bottom-bar').screenshot()).toMatchSnapshot('calls-widget-bottom-bar.png');
        await devPage.leaveCall();
    });

    test('slash command', async ({page, context}) => {
        await page.locator('#post_textbox').fill('/call join');
        await page.getByTestId('SendMessageButton').click();
        await expect(page.locator('#calls-widget')).toBeVisible();
        await expect(page.getByTestId('calls-widget-loading-overlay')).toBeHidden();
        await page.locator('#post_textbox').fill('/call leave');
        await page.getByTestId('SendMessageButton').click();
        await expect(page.locator('#calls-widget')).toBeHidden();
    });

    test('dm channel', async ({page, context}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.gotoDM(usernames[1]);
        await devPage.startCall();
        expect(await page.locator('#calls-widget .calls-widget-bottom-bar').screenshot()).toMatchSnapshot('dm-calls-widget-bottom-bar.png');
        await devPage.leaveCall();
    });

    test('cannot start call twice', async ({page, context}) => {
        await page.locator('#post_textbox').fill('/call start');
        await page.getByTestId('SendMessageButton').click();
        await expect(page.locator('#calls-widget')).toBeVisible();
        await expect(page.getByTestId('calls-widget-loading-overlay')).toBeHidden();

        await page.locator('#post_textbox').fill('/call start');
        await page.getByTestId('SendMessageButton').click();
        await expect(page.locator('#calls-widget')).toBeVisible();

        await expect(page.locator('#calls_generic_error').filter({has: page.getByText('A call is already ongoing in the channel.')})).toBeVisible();
        await page.keyboard.press('Escape');

        await page.locator('#post_textbox').fill('/call leave');
        await page.getByTestId('SendMessageButton').click();
        await expect(page.locator('#calls-widget')).toBeHidden();
    });

    test('slash command from existing thread', async ({page, context}) => {
        // create a test thread
        await page.locator('#post_textbox').fill('test thread');
        await page.getByTestId('SendMessageButton').click();
        const post = page.locator('.post-message__text').last();
        await expect(post).toBeVisible();

        // open RHS
        await post.click();
        await expect(page.locator('#rhsContainer')).toBeVisible();

        // send slash command in thread to start a call.
        await page.locator('#reply_textbox').fill('/call start');
        await page.locator('#reply_textbox').press('Control+Enter');
        await expect(page.locator('#calls-widget')).toBeVisible();

        // verify the call post is created in the thread.
        await expect(page.locator('#rhsContainer').filter({has: page.getByText(`${usernames[0]} started a call`)})).toBeVisible();

        await page.locator('#reply_textbox').fill('/call leave');
        await page.locator('#reply_textbox').press('Control+Enter');
        await expect(page.locator('#calls-widget')).toBeHidden();
    });

    test('verify no one is talking…', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.startCall();

        await expect(page.locator('#calls-widget').filter({has: page.getByText('No one is talking…')})).toBeVisible();

        await devPage.leaveCall();
    });

    test('ws reconnect', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.startCall();

        const reconnected = await page.evaluate(() => {
            return new Promise((resolve) => {
                window.callsClient.ws.on('open', (connID: string, originalConnID: string, isReconnect: boolean) => {
                    resolve(isReconnect);
                });
                window.callsClient.ws.ws.close();
            });
        });

        expect(reconnected).toBe(true);

        // Waiting a bit to make extra sure connection won't close after a timeout.
        await devPage.wait(15000);

        await devPage.leaveCall();
    });
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
});

test.describe('auto join link', () => {
    test.use({storageState: userStorages[0]});

    test('public channel', async ({page, context}) => {
        const devPage = new PlaywrightDevPage(page);

        await page.locator('#post_textbox').fill('/call link');
        await page.getByTestId('SendMessageButton').click();

        // Make sure we get the ephemeral post and not something else that may
        // have been posted by a concurrent test.
        const postContent = page.locator('.post__content', {has: page.locator('.post__visibility', {hasText: '(Only visible to you)'})});
        await expect(postContent).toBeVisible();

        const content = await postContent.locator('.post-message__text').textContent();
        if (!content) {
            test.fail();
            return;
        }
        const link = content.replace('Call link: ', '');
        page.goto(link);

        await expect(page.locator('#calls-widget')).toBeVisible();
        await expect(page.getByTestId('calls-widget-loading-overlay')).toBeHidden();

        await devPage.leaveCall();
    });

    test('dm channel', async ({page, context}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.gotoDM(usernames[1]);

        await page.locator('#post_textbox').fill('/call link');
        await page.getByTestId('SendMessageButton').click();

        const post = page.locator('.post-message__text').last();
        await expect(post).toBeVisible();

        const content = await post.textContent();
        if (!content) {
            test.fail();
            return;
        }
        const link = content.replace('Call link: ', '');
        page.goto(link);

        await expect(page.locator('#calls-widget')).toBeVisible();
        await expect(page.getByTestId('calls-widget-loading-overlay')).toBeHidden();

        await devPage.leaveCall();
    });
});

test.describe('setting audio input device', () => {
    test.use({storageState: userStorages[0]});

    test('no default', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.startCall();

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
    test.use({storageState: userStorages[0]});

    test('no default', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.startCall();

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
    test.use({storageState: userStorages[0]});

    test('playbooks', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.startCall();

        const switchProductsButton = devPage.page.locator('h1', {hasText: 'Channels'});
        await expect(switchProductsButton).toBeVisible();
        await switchProductsButton.click();

        const boardsButton = devPage.page.locator('#product-switcher-menu-dropdown div', {hasText: 'Playbooks'});
        await expect(boardsButton).toBeVisible();
        await boardsButton.click();

        await expect(devPage.page.locator('#calls-widget')).toBeVisible();

        await devPage.page.locator('#calls-widget-participants-button').click();
        const participantsList = devPage.page.locator('#calls-widget-participants-list');
        await expect(participantsList).toBeVisible();
        expect(await participantsList.screenshot()).toMatchSnapshot('calls-widget-participants-list-playbooks.png');

        await devPage.leaveCall();
    });
});

test.describe('switching views', () => {
    test.use({storageState: adminState.storageStatePath});

    test('system console', async ({page}) => {
        // Using the second channel allocated for the test to avoid a potential
        // race condition with a previous test making use of the system admin.
        const channelName = getChannelNamesForTest()[1];
        const devPage = new PlaywrightDevPage(page);
        devPage.goToChannel(channelName);
        await devPage.startCall();

        // Switch to admin console
        await devPage.page.locator('#product_switch_menu').click();
        await expect(devPage.page.locator('#product-switcher-menu-dropdown')).toBeVisible();
        await devPage.page.locator('#product-switcher-menu-dropdown').locator('li', {hasText: 'System Console'}).click();

        // Verify widget is still rendered
        await expect(devPage.page.locator('#calls-widget')).toBeVisible();

        // Switch back to channel
        await devPage.page.locator('a.backstage-navbar__back').click();

        // Verify widget is still rendered
        await expect(devPage.page.locator('#calls-widget')).toBeVisible();

        await devPage.leaveCall();
    });
});

test.describe('ux', () => {
    const userIdx = getUserIdxForTest();
    test.use({storageState: userStorages[0]});

    test('channel link', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.startCall();

        // Check we are on the expected URL
        await expect(page.url()).toEqual(getChannelURL(getChannelNamesForTest()[0]));

        // Switch channel
        await page.locator(`#sidebarItem_calls${userIdx + 1}`).click();

        // Verify we switched channel
        await expect(page.url()).toEqual(getChannelURL(`calls${userIdx + 1}`));

        // Click channel link in widget
        await page.locator('.calls-channel-link').click();

        // Verify we switched channel through the link
        await expect(page.url()).toEqual(getChannelURL(getChannelNamesForTest()[0]));

        await devPage.leaveCall();
    });
});
