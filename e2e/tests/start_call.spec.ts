import {expect, Response, test} from '@playwright/test';

import {
    apiGetChannelByName,
} from '../channels';
import {adminState, baseURL} from '../constants';
import PlaywrightDevPage from '../page';
import {
    getChannelNamesForTest,
    getChannelURL,
    getUserIDsForTest,
    getUserIdxForTest,
    getUsernamesForTest,
    getUserStoragesForTest,
    newUserPage,
} from '../utils';

const userStorages = getUserStoragesForTest();
const usernames = getUsernamesForTest();

test.beforeEach(async ({page}, info) => {
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

    test('slash command', async ({page}) => {
        await page.locator('#post_textbox').fill('/call join');
        await page.getByTestId('SendMessageButton').click();
        await expect(page.locator('#calls-widget')).toBeVisible();
        await expect(page.getByTestId('calls-widget-loading-overlay')).toBeHidden();
        await page.locator('#post_textbox').fill('/call leave');
        await page.getByTestId('SendMessageButton').click();
        await expect(page.locator('#calls-widget')).toBeHidden();
    });

    test('dm channel', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.gotoDM(usernames[1]);
        await devPage.startCall();
        expect(await page.locator('#calls-widget .calls-widget-bottom-bar').screenshot()).toMatchSnapshot('dm-calls-widget-bottom-bar.png');
        await devPage.leaveCall();
    });

    test('cannot start call twice', async ({page}) => {
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

    test('slash command from existing thread', async ({page}) => {
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
        await expect(page.locator('#rhsContainer').filter({has: page.getByText('Call started')})).toBeVisible();
        await expect(page.locator('#rhsContainer').filter({has: page.getByText(`by ${usernames[0]}`)})).toBeVisible();

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

test.describe('auto join link', () => {
    test.use({storageState: userStorages[0]});

    test('public channel', async ({page}) => {
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

    test('dm channel', async ({page}) => {
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

test.describe('call post', () => {
    test.use({storageState: userStorages[0]});

    test('user starting call should not be allowed to edit the call post', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.startCall();

        const postEl = page.locator('.post__body').last();
        await postEl.hover();
        const postID = (await postEl.getAttribute('id'))?.substr(0, 26);

        await page.getByTestId('PostDotMenu-Button-' + postID).click();

        // Select the 'edit' option from the dot menu
        await page.keyboard.type('e');

        await page.keyboard.type('Edited');

        const postPatch: Promise<Response> = new Promise((resolve) => {
            page.on('response', (response) => {
                if (response.url().endsWith(`/api/v4/posts/${postID}/patch`)) {
                    resolve(response);
                }
            });
        });

        await page.keyboard.press('Enter');

        expect((await postPatch).ok()).toBe(false);

        await devPage.leaveCall();
    });
});

test.describe('permissions', () => {
    test.use({storageState: userStorages[0]});

    test('leaving active call channel should disconnect from call', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.startCall();

        // Leave channel
        await page.locator('#post_textbox').fill('/leave');
        await page.getByTestId('SendMessageButton').click();

        // Verify user disconnected and error modal gets shown
        await expect(page.locator('#call-error-modal')).toBeVisible();
        await expect(page.locator('#call-error-modal')).toContainText('You have left the channel, and have been disconnected from the call.');
        await expect(page.locator('#calls-widget')).toBeHidden();
        await page.keyboard.press('Escape');
        await expect(page.locator('#call-error-modal')).toBeHidden();

        // Re-join channel
        await page.locator('#post_textbox').fill(`/join ~${getChannelNamesForTest()[0]}`);
        await page.getByTestId('SendMessageButton').click();
    });

    test('should disconnect from call when removed from channel', async ({page}) => {
        const channelName = getChannelNamesForTest()[1];
        const devPage = new PlaywrightDevPage(page);
        devPage.goToChannel(channelName);
        await devPage.startCall();

        // Remove user from channel
        const adminContext = (await newUserPage(adminState.storageStatePath)).page.request;
        const channel = await apiGetChannelByName(adminContext, getChannelNamesForTest()[1]);
        let resp = await adminContext.delete(`${baseURL}/api/v4/channels/${channel.id}/members/${getUserIDsForTest()[0]}`, {
            headers: {'X-Requested-With': 'XMLHttpRequest'},
        });
        await expect(resp.status()).toEqual(200);

        // Verify user disconnected and error modal gets shown
        await expect(page.locator('#call-error-modal')).toBeVisible();
        await expect(page.locator('#call-error-modal')).toContainText('You have been removed from the channel, and have been disconnected from the call.');
        await expect(page.locator('#calls-widget')).toBeHidden();

        // Re-add user to channel
        resp = await adminContext.post(`${baseURL}/api/v4/channels/${channel.id}/members`, {
            headers: {'X-Requested-With': 'XMLHttpRequest'},
            data: {
                channel_id: channel.id,
                user_id: getUserIDsForTest()[0],
            },
        });
        await expect(resp.status()).toEqual(201);
    });
});

test.describe('widget menu', () => {
    test.use({storageState: userStorages[0]});

    test('menu button should open call thread', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.startCall();

        // Verify RHS is closed.
        await expect(page.locator('#rhsContainer')).toBeHidden();

        // Open menu
        await page.locator('#calls-widget-toggle-menu-button').click();

        // Click to show chat
        await page.locator('#calls-widget-menu-chat-button').click();

        // Verify menu closed
        await expect(page.getByTestId('calls-widget-menu')).toBeHidden();

        // Verify RHS is open and call thread is showing.
        await expect(page.locator('#rhsContainer')).toBeVisible();
        await expect(page.locator('#rhsContainer').filter({has: page.getByText('Call started')})).toBeVisible();
        await expect(page.locator('#rhsContainer').filter({has: page.getByText(`by ${usernames[0]}`)})).toBeVisible();

        await devPage.leaveCall();
    });
});
