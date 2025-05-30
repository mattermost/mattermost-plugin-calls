// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@playwright/test';

import {apiSetEnableAV1} from '../config';
import PlaywrightDevPage from '../page';
import {getUserStoragesForTest, startCall} from '../utils';

const userStorages = getUserStoragesForTest();

test.beforeEach(async ({page}) => {
    const devPage = new PlaywrightDevPage(page);
    await devPage.goto();
});

test.describe('screen sharing', () => {
    test.use({storageState: userStorages[0]});

    test('share screen button', {
        tag: '@core',
    }, async ({page}) => {
        const devPage = new PlaywrightDevPage(page);

        const [userPage, _] = await Promise.all([
            startCall(userStorages[1]),
            devPage.joinCall(),
        ]);

        await page.locator('#calls-widget-toggle-menu-button').click();
        await page.locator('#calls-widget-menu-screenshare').click();

        await expect(page.locator('#screen-player')).toBeVisible();
        await expect(userPage.page.locator('#screen-player')).toBeVisible();

        const screenStreamID = await (await userPage.page.waitForFunction(() => {
            return window.callsClient.getRemoteScreenStream()?.getVideoTracks()[0]?.id;
        })).evaluate(() => {
            return window.callsClient.getRemoteScreenStream()?.getVideoTracks()[0]?.id;
        });
        expect(screenStreamID).toContain('screen_');

        await page.getByTestId('calls-widget-stop-screenshare').click();

        await expect(page.locator('#screen-player')).toBeHidden();
        await expect(userPage.page.locator('#screen-player')).toBeHidden();

        await Promise.all([devPage.leaveCall(), userPage.leaveCall()]);
    });

    test('share screen keyboard shortcut', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);

        const [userPage, _] = await Promise.all([
            startCall(userStorages[1]),
            devPage.joinCall(),
        ]);

        if (process.platform === 'darwin') {
            await page.keyboard.press('Meta+Shift+E');
        } else {
            await page.keyboard.press('Control+Shift+E');
        }

        await expect(page.locator('#screen-player')).toBeVisible();
        await expect(userPage.page.locator('#screen-player')).toBeVisible();

        const screenTrackID = await (await userPage.page.waitForFunction(() => {
            return window.callsClient.getRemoteScreenStream()?.getVideoTracks()[0]?.id;
        })).evaluate(() => {
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

        await Promise.all([devPage.leaveCall(), userPage.leaveCall()]);
    });

    test('presenter leaving and joining back', {
        tag: '@core',
    }, async ({page}) => {
        const devPage = new PlaywrightDevPage(page);

        const [userPage, _] = await Promise.all([
            startCall(userStorages[1]),
            devPage.joinCall(),
        ]);

        // presenter starts sharing
        await page.locator('#calls-widget-toggle-menu-button').click();
        await page.locator('#calls-widget-menu-screenshare').click();

        // verify that on both sides the screen sharing player is rendered
        await expect(page.locator('#screen-player')).toBeVisible();
        await expect(userPage.page.locator('#screen-player')).toBeVisible();

        // verify that on the receiving side the screen track is correctly set
        let screenStreamID = await (await userPage.page.waitForFunction(() => {
            return window.callsClient.getRemoteScreenStream()?.getVideoTracks()[0]?.id;
        })).evaluate(() => {
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

        // verify that on the receiving side the screen track is correctly set
        screenStreamID = await (await devPage.page.waitForFunction(() => {
            return window.callsClient.getRemoteScreenStream()?.getVideoTracks()[0]?.id;
        })).evaluate(() => {
            return window.callsClient.getRemoteScreenStream()?.getVideoTracks()[0]?.id;
        });
        expect(screenStreamID).toContain('screen_');

        await Promise.all([devPage.leaveCall(), userPage.leaveCall()]);
    });

    test('av1', {
        tag: '@core',
    }, async ({page}) => {
        test.setTimeout(180000);

        // Enabling AV1
        await apiSetEnableAV1(true);

        const senderPage = new PlaywrightDevPage(page);

        const [receiverPage, _] = await Promise.all([
            startCall(userStorages[1]),
            senderPage.joinCall(),
        ]);

        await page.locator('#calls-widget-toggle-menu-button').click();
        await page.locator('#calls-widget-menu-screenshare').click();

        await expect(page.locator('#screen-player')).toBeVisible();
        await expect(receiverPage.page.locator('#screen-player')).toBeVisible();

        let screenStreamID = await (await receiverPage.page.waitForFunction(() => {
            return window.callsClient.getRemoteScreenStream()?.getVideoTracks()[0]?.id;
        })).evaluate(() => {
            return window.callsClient.getRemoteScreenStream()?.getVideoTracks()[0]?.id;
        });
        expect(screenStreamID).toContain('screen_');

        // Give it a couple of seconds for encoders/decoders stats to be available.
        await senderPage.wait(2000);

        type rtcCodecStats = {
            type: string,
            codecId: string,
        };

        let rxCodec = await receiverPage.page.evaluate(async () => {
            const stats = await window.callsClient.peer.pc.getStats();
            let codec = '';
            stats.forEach((report: rtcCodecStats) => {
                if (report.type !== 'inbound-rtp') {
                    return;
                }
                codec = report.codecId;
            });
            return codec;
        });
        expect(rxCodec).toBe('CIT01_45_level-idx=5;profile=0;tier=0');

        let txCodecs = await senderPage.page.evaluate(async () => {
            const stats = await window.callsClient.peer.pc.getStats();
            const codecs: string[] = [];
            stats.forEach((report: rtcCodecStats) => {
                if (report.type !== 'outbound-rtp') {
                    return;
                }
                codecs.push(report.codecId);
            });
            return codecs;
        });
        expect(txCodecs).toContain('COT01_39_level-idx=5;profile=0;tier=0');
        expect(txCodecs).toContain('COT01_96');

        await page.getByTestId('calls-widget-stop-screenshare').click();

        await expect(page.locator('#screen-player')).toBeHidden();
        await expect(receiverPage.page.locator('#screen-player')).toBeHidden();

        await Promise.all([senderPage.leaveCall(), receiverPage.leaveCall()]);

        // Disabling AV1
        await apiSetEnableAV1(false);

        // need to refresh for the updated config to be loaded
        await Promise.all([senderPage.page.reload(), receiverPage.page.reload()]);

        await Promise.all([receiverPage.startCall(), senderPage.joinCall()]);

        await page.locator('#calls-widget-toggle-menu-button').click();
        await page.locator('#calls-widget-menu-screenshare').click();

        await expect(page.locator('#screen-player')).toBeVisible();
        await expect(receiverPage.page.locator('#screen-player')).toBeVisible();

        screenStreamID = await (await receiverPage.page.waitForFunction(() => {
            return window.callsClient.getRemoteScreenStream()?.getVideoTracks()[0]?.id;
        })).evaluate(() => {
            return window.callsClient.getRemoteScreenStream()?.getVideoTracks()[0]?.id;
        });
        expect(screenStreamID).toContain('screen_');

        // Give it a couple of seconds for encoders/decoders stats to be available.
        await senderPage.wait(2000);

        rxCodec = await receiverPage.page.evaluate(async () => {
            const stats = await window.callsClient.peer.pc.getStats();
            let codec = '';
            stats.forEach((report: rtcCodecStats) => {
                if (report.type !== 'inbound-rtp') {
                    return;
                }
                codec = report.codecId;
            });
            return codec;
        });
        expect(rxCodec).toBe('CIT01_96');

        txCodecs = await senderPage.page.evaluate(async () => {
            const stats = await window.callsClient.peer.pc.getStats();
            const codecs: string[] = [];
            stats.forEach((report: rtcCodecStats) => {
                if (report.type !== 'outbound-rtp') {
                    return;
                }
                codecs.push(report.codecId);
            });
            return codecs;
        });
        expect(txCodecs).toHaveLength(1);
        expect(txCodecs[0]).toBe('COT01_96');

        await page.getByTestId('calls-widget-stop-screenshare').click();

        await expect(page.locator('#screen-player')).toBeHidden();
        await expect(receiverPage.page.locator('#screen-player')).toBeHidden();

        await Promise.all([senderPage.leaveCall(), receiverPage.leaveCall()]);
    });

    test('share screen with audio', {
        tag: '@core',
    }, async ({page}) => {
        const senderPage = new PlaywrightDevPage(page);

        const [receiverPage, _] = await Promise.all([
            startCall(userStorages[1]),
            senderPage.joinCall(),
        ]);

        await senderPage.page.locator('#calls-widget').getByLabel('Settings').click();
        await senderPage.page.getByText('Additional settings').click();

        // Verify that Calls Settings are open and visible.
        await expect(senderPage.page.getByRole('heading', {name: 'Calls Settings'})).toBeVisible();

        // Enable screen sharing with audio.
        await senderPage.page.getByText('Screen sharing settings', {exact: true}).click();

        // Setting should be off by default.
        expect(senderPage.page.locator('.setting-list-item').getByRole('radio', {name: 'On'})).not.toBeChecked();
        expect(senderPage.page.locator('.setting-list-item').getByRole('radio', {name: 'Off'})).toBeChecked();

        // Turning setting on.
        await senderPage.page.locator('.setting-list-item').getByRole('radio', {name: 'On'}).check();
        expect(senderPage.page.locator('.setting-list-item').getByRole('radio', {name: 'On'})).toBeChecked();
        await senderPage.page.getByText('Save').click();

        // Exit Calls Settings.
        await senderPage.page.getByLabel('Close').click();

        // Verify that the setting is saved in local storage.
        const settingSavedInStorage = await (await senderPage.page.waitForFunction(() => {
            return window.localStorage.getItem('calls_share_audio_with_screen') === 'on';
        })).evaluate(() => {
            return window.localStorage.getItem('calls_share_audio_with_screen') === 'on';
        });

        expect(settingSavedInStorage).toBe(true);

        // Start screen sharing with audio.
        await senderPage.page.locator('#calls-widget-toggle-menu-button').click();
        await senderPage.page.locator('#calls-widget-menu-screenshare').click();

        // Verify that the screen sharing player is rendering on both sides.
        await expect(senderPage.page.locator('#screen-player')).toBeVisible();
        await expect(receiverPage.page.locator('#screen-player')).toBeVisible();

        // Verify that the audio track for screen sharing is received.
        const hasReceivedAudioScreenTrack = await (await receiverPage.page.waitForFunction(() => {
            return window.callsClient.remoteVoiceTracks.length > 0;
        })).evaluate(() => {
            return window.callsClient.remoteVoiceTracks.length > 0;
        });
        expect(hasReceivedAudioScreenTrack).toBe(true);

        await Promise.all([senderPage.leaveCall(), receiverPage.leaveCall()]);
    });
});

test.describe('sending voice', () => {
    test.use({storageState: userStorages[0]});

    test('unmuting', {
        tag: '@core',
    }, async ({page}) => {
        const devPage = new PlaywrightDevPage(page);

        const [userPage, _] = await Promise.all([
            startCall(userStorages[1]),
            devPage.joinCall(),
        ]);

        await page.locator('#voice-mute-unmute').click();

        let voiceTrackID = await (await userPage.page.waitForFunction(() => {
            return window.callsClient.streams[1]?.getAudioTracks()[0]?.id;
        })).evaluate(() => {
            return window.callsClient.streams[1]?.getAudioTracks()[0]?.id;
        });

        await expect(userPage.page.getByTestId(voiceTrackID)).toBeHidden();
        await expect(userPage.page.getByTestId(voiceTrackID)).toHaveAttribute('autoplay', '');

        await userPage.page.locator('#voice-mute-unmute').click();

        voiceTrackID = await (await devPage.page.waitForFunction(() => {
            return window.callsClient.streams[1]?.getAudioTracks()[0]?.id;
        })).evaluate(() => {
            return window.callsClient.streams[1]?.getAudioTracks()[0]?.id;
        });

        await expect(page.getByTestId(voiceTrackID)).toBeHidden();
        await expect(page.getByTestId(voiceTrackID)).toHaveAttribute('autoplay', '');

        await Promise.all([devPage.leaveCall(), userPage.leaveCall()]);
    });

    test('unmuting after ws reconnect', {
        tag: '@core',
    }, async ({page}) => {
        const devPage = new PlaywrightDevPage(page);

        const [userPage, _] = await Promise.all([
            startCall(userStorages[1]),
            devPage.joinCall(),
        ]);

        const reconnectHandler = () => {
            return new Promise((resolve) => {
                window.callsClient.ws.on('open', (connID: string, originalConnID: string, isReconnect: boolean) => {
                    resolve(isReconnect);
                });
                window.callsClient.ws.ws.close();
            });
        };

        // Trigger a WS reconnect on userA
        const reconnectedA = await page.evaluate(reconnectHandler);
        expect(reconnectedA).toBe(true);

        // Trigger a WS reconnect on userB
        const reconnectedB = await userPage.page.evaluate(reconnectHandler);
        expect(reconnectedB).toBe(true);

        await page.locator('#voice-mute-unmute').click();

        let voiceTrackID = await (await userPage.page.waitForFunction(() => {
            return window.callsClient.streams[1]?.getAudioTracks()[0]?.id;
        })).evaluate(() => {
            return window.callsClient.streams[1]?.getAudioTracks()[0]?.id;
        });

        await expect(userPage.page.getByTestId(voiceTrackID)).toBeHidden();
        await expect(userPage.page.getByTestId(voiceTrackID)).toHaveAttribute('autoplay', '');

        await userPage.page.locator('#voice-mute-unmute').click();

        voiceTrackID = await (await devPage.page.waitForFunction(() => {
            return window.callsClient.streams[1]?.getAudioTracks()[0]?.id;
        })).evaluate(() => {
            return window.callsClient.streams[1]?.getAudioTracks()[0]?.id;
        });

        await expect(page.getByTestId(voiceTrackID)).toBeHidden();
        await expect(page.getByTestId(voiceTrackID)).toHaveAttribute('autoplay', '');

        await Promise.all([devPage.leaveCall(), userPage.leaveCall()]);
    });
});
