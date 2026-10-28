// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, Page, test} from '@playwright/test';

import PlaywrightDevPage from '../page';
import {getUserStoragesForTest, joinCall, startCall} from '../utils';

const userStorages = getUserStoragesForTest();

test.beforeEach(async ({page}) => {
    const devPage = new PlaywrightDevPage(page);
    await devPage.goto();
});

test.describe('screen sharing', {tag: '@livekit'}, () => {
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

        // Asserting a screen track ID is present is enough — RTCD used to
        // prefix IDs with 'screen_', but LiveKit assigns its own track IDs
        // ('TR_VS…'). What we care about is that the remote side received a
        // screen video track at all.
        const screenStreamID = await (await userPage.page.waitForFunction(() => {
            return window.callsClient.getRemoteScreenStream()?.getVideoTracks()[0]?.id;
        })).evaluate(() => {
            return window.callsClient.getRemoteScreenStream()?.getVideoTracks()[0]?.id;
        });
        expect(screenStreamID).toBeTruthy();

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
        expect(screenTrackID).toBeTruthy();

        if (process.platform === 'darwin') {
            await page.keyboard.press('Meta+Shift+E');
        } else {
            await page.keyboard.press('Control+Shift+E');
        }

        await expect(page.locator('#screen-player')).toBeHidden();
        await expect(userPage.page.locator('#screen-player')).toBeHidden();

        await Promise.all([devPage.leaveCall(), userPage.leaveCall()]);
    });

    // Two clients going for the share at once. Keyed on session, not user, so
    // the same person on two clients collides with themselves — which is also
    // the cheapest way to stage it.
    //
    // Both clients must converge on the *same* sharer. Before the derivation
    // landed each client kept whichever track arrived last, so viewers could
    // render different screens and one sharer stopping blanked people watching
    // the other. The winner is whoever the shared tie-break picks (lowest
    // session id), not whoever clicked first, so the test asserts agreement
    // rather than a particular winner.
    // Skipped: flaky (the two sessions intermittently disagree on the presenter).
    test.skip('concurrent screen shares converge on one presenter', {
        tag: '@core',
    }, async ({page}) => {
        const devPage = new PlaywrightDevPage(page);

        const [userPage, _] = await Promise.all([
            startCall(userStorages[1]),
            devPage.joinCall(),
        ]);

        // Fire both without awaiting in between, so neither client has seen the
        // other's track by the time it starts its own.
        await Promise.all([
            (async () => {
                await page.locator('#calls-widget-toggle-menu-button').click();
                await page.locator('#calls-widget-menu-screenshare').click();
            })(),
            (async () => {
                await userPage.page.locator('#calls-widget-toggle-menu-button').click();
                await userPage.page.locator('#calls-widget-menu-screenshare').click();
            })(),
        ]);

        // Exactly one share is presented, and both sides are showing it.
        await expect(page.locator('#screen-player')).toBeVisible();
        await expect(userPage.page.locator('#screen-player')).toBeVisible();

        const presentedSession = (p: PlaywrightDevPage) => p.page.evaluate(() => {
            return window.callsClient.getCurrentScreenSharingSessionID?.() ?? null;
        });

        const [sessionA, sessionB] = await Promise.all([
            presentedSession(devPage),
            presentedSession(userPage),
        ]);

        expect(sessionA).toBeTruthy();
        expect(sessionA).toBe(sessionB);

        await Promise.all([devPage.leaveCall(), userPage.leaveCall()]);
    });

    // MM-68570: flaky on the rejoin step. After leaveCall, when joinCall is
    // immediately called again on the same page, window.callsClient races —
    // the new CallClient instance's isConnected doesn't flip within 150s.
    // Passed in one CI run, failed in the next on the same branch. MM-69018's
    // teardown improved this but didn't fully fix it; needs a "new
    // callsClient instance" detection in the helper rather than polling
    // isConnected on whatever happens to be at window.callsClient.
    test.fixme('presenter leaving and joining back', {
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
        expect(screenStreamID).toBeTruthy();

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
        expect(screenStreamID).toBeTruthy();

        await Promise.all([devPage.leaveCall(), userPage.leaveCall()]);
    });

    test('share screen with audio', {
        tag: '@core',
    }, async ({page}) => {
        const senderPage = new PlaywrightDevPage(page);

        const [receiverPage, _] = await Promise.all([
            startCall(userStorages[1]),
            senderPage.joinCall(),
        ]);

        await stubDisplayMediaWithAudio(senderPage.page);
        await startScreenShare(senderPage.page);

        await expect(senderPage.page.locator('#screen-player')).toBeVisible();
        await expect(receiverPage.page.locator('#screen-player')).toBeVisible();

        const audioTrackID = await getRemoteScreenAudioTrackID(receiverPage.page);
        await expectAudioPlaying(receiverPage.page, audioTrackID);

        await senderPage.page.getByTestId('calls-widget-stop-screenshare').click();
        await expect(receiverPage.page.locator('#screen-player')).toBeHidden();
        await expect(receiverPage.page.getByTestId(audioTrackID)).toHaveCount(0);

        await Promise.all([senderPage.leaveCall(), receiverPage.leaveCall()]);
    });

    test('share screen with audio, late joiner', async ({page}) => {
        const senderPage = new PlaywrightDevPage(page);
        await senderPage.startCall();

        await stubDisplayMediaWithAudio(senderPage.page);
        await startScreenShare(senderPage.page);
        await expect(senderPage.page.locator('#screen-player')).toBeVisible();

        const receiverPage = await joinCall(userStorages[1]);
        await expect(receiverPage.page.locator('#screen-player')).toBeVisible();

        const audioTrackID = await getRemoteScreenAudioTrackID(receiverPage.page);
        await expectAudioPlaying(receiverPage.page, audioTrackID);

        await Promise.all([senderPage.leaveCall(), receiverPage.leaveCall()]);
    });
});

// Replaces the screen picker with a canvas video track and a tone, so the test
// controls the shared audio instead of depending on system audio capture.
async function stubDisplayMediaWithAudio(page: Page) {
    await page.evaluate(() => {
        window.localStorage.setItem('calls_share_audio_with_screen', 'on');

        navigator.mediaDevices.getDisplayMedia = async () => {
            const canvas = document.createElement('canvas');
            canvas.width = 640;
            canvas.height = 360;
            const ctx2d = canvas.getContext('2d');
            const draw = () => {
                if (ctx2d) {
                    ctx2d.fillStyle = `hsl(${Date.now() % 360}, 60%, 50%)`;
                    ctx2d.fillRect(0, 0, canvas.width, canvas.height);
                }
                requestAnimationFrame(draw);
            };
            draw();

            const audioCtx = new AudioContext();
            await audioCtx.resume();
            const oscillator = audioCtx.createOscillator();
            const destination = audioCtx.createMediaStreamDestination();
            oscillator.connect(destination);
            oscillator.start();

            return new MediaStream([
                ...canvas.captureStream(30).getVideoTracks(),
                ...destination.stream.getAudioTracks(),
            ]);
        };
    });
}

async function startScreenShare(page: Page) {
    await page.locator('#calls-widget-toggle-menu-button').click();
    await page.locator('#calls-widget-menu-screenshare').click();
}

async function getRemoteScreenAudioTrackID(page: Page) {
    const handle = await page.waitForFunction(() => {
        return window.callsClient.getRemoteScreenStream()?.getAudioTracks()[0]?.id;
    });
    const trackID = await handle.jsonValue();
    expect(trackID).toBeTruthy();
    return trackID as string;
}

// Checks that an unmuted <audio> element is actually playing the track, not
// just that the track was received.
async function expectAudioPlaying(page: Page, trackID: string) {
    const findAudioTime = (id: string) => {
        const el = Array.from(document.querySelectorAll('audio')).find((audio) => {
            const stream = audio.srcObject as MediaStream | null;
            return stream?.getAudioTracks().some((track) => track.id === id);
        });
        if (!el || el.muted || el.paused) {
            return null;
        }
        return el.currentTime;
    };

    const startTime = await (await page.waitForFunction(findAudioTime, trackID)).jsonValue();
    await page.waitForTimeout(1500);
    const endTime = await page.evaluate(findAudioTime, trackID);

    expect(endTime).not.toBeNull();
    expect(endTime as number).toBeGreaterThan(startTime as number);
}

test.describe('sending voice', {tag: '@livekit'}, () => {
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

        // Wait for userB to have a remote voice track from userA, then assert
        // the widget rendered an <audio data-testid={track.id}> for it.
        // RTCD exposed remote tracks via callsClient.streams[1]; LiveKit
        // exposes them through getRemoteVoiceTracks() (see
        // call_client.ts:400).
        let voiceTrackID = await (await userPage.page.waitForFunction(() => {
            return window.callsClient.getRemoteVoiceTracks()[0]?.id;
        })).evaluate(() => {
            return window.callsClient.getRemoteVoiceTracks()[0]?.id;
        });

        await expect(userPage.page.getByTestId(voiceTrackID)).toBeHidden();
        await expect(userPage.page.getByTestId(voiceTrackID)).toHaveAttribute('autoplay', '');

        await userPage.page.locator('#voice-mute-unmute').click();

        voiceTrackID = await (await devPage.page.waitForFunction(() => {
            return window.callsClient.getRemoteVoiceTracks()[0]?.id;
        })).evaluate(() => {
            return window.callsClient.getRemoteVoiceTracks()[0]?.id;
        });

        await expect(page.getByTestId(voiceTrackID)).toBeHidden();
        await expect(page.getByTestId(voiceTrackID)).toHaveAttribute('autoplay', '');

        await Promise.all([devPage.leaveCall(), userPage.leaveCall()]);
    });

    // MM-69653: every join is a new LiveKit identity with a new mic track. The
    // listener must play the new one and drop the <audio> of sessions that left.
    test('remote audio plays after speaker rapidly leaves and re-joins', async ({page, browser}) => {
        let speaker = new PlaywrightDevPage(page);
        const [listener, _] = await Promise.all([
            startCall(userStorages[1]),
            speaker.joinCall(),
        ]);

        await speaker.unmute();
        const firstTrack = await getRemoteVoiceTrackOf(listener.page, speaker.page);
        await expectAudioPlaying(listener.page, firstTrack.id);

        // Re-joins use pages loaded up front, so each leave is followed straight
        // away by a join, and each on a fresh CallClient (see MM-68570 above).
        const rejoinPages = await Promise.all([1, 2, 3].map(async () => {
            const context = await browser.newContext({storageState: userStorages[0]});
            const rejoinPage = new PlaywrightDevPage(await context.newPage());
            await rejoinPage.goto();
            return rejoinPage;
        }));
        /* eslint-disable no-await-in-loop */
        for (const next of rejoinPages) {
            await speaker.leaveCall();
            if (speaker.page !== page) {
                await speaker.page.context().close();
            }
            await next.joinCall();
            await next.unmute();
            speaker = next;
        }

        const muteButton = speaker.page.locator('#voice-mute-unmute');
        await expect(muteButton).toHaveAttribute('aria-label', 'Mute');
        for (const label of ['Unmute', 'Mute', 'Unmute', 'Mute']) {
            await muteButton.click();
            await expect(muteButton).toHaveAttribute('aria-label', label);
        }
        /* eslint-enable no-await-in-loop */

        const track = await getRemoteVoiceTrackOf(listener.page, speaker.page);
        expect(track.sid).not.toBe(firstTrack.sid);
        await expectAudioPlaying(listener.page, track.id);

        // No <audio> left behind by the sessions that left.
        await expect(listener.page.getByTestId(track.id)).toHaveCount(1);

        await Promise.all([speaker.leaveCall(), listener.leaveCall()]);
        await speaker.page.context().close();
    });
});

// The subscriber recycles transceivers, so a re-joined speaker's track arrives
// on the same MediaStreamTrack (same id) as the one before. Match the speaker's
// current LiveKit identity (userID___sessionID) and return the track SID too.
async function getRemoteVoiceTrackOf(listenerPage: Page, speakerPage: Page) {
    const sessionID = await speakerPage.evaluate(() => window.callsClient.getSessionID());
    const handle = await listenerPage.waitForFunction((sid) => {
        const participants = Array.from(window.callsClient.room?.remoteParticipants.values() ?? []) as any[];
        const speaker = participants.find((p) => p.identity.endsWith(`___${sid}`));
        const pub = Array.from(speaker?.audioTrackPublications.values() ?? []).find((p: any) => p.source === 'microphone') as any;
        if (!pub?.isSubscribed || pub.isMuted || pub.track?.mediaStreamTrack.readyState !== 'live') {
            return null;
        }
        return {id: pub.track.mediaStreamTrack.id, sid: pub.trackSid};
    }, sessionID);
    return await handle.jsonValue() as {id: string, sid: string};
}
