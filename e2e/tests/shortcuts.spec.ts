// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@playwright/test';

import {defaultTeam} from '../constants';
import {isHandRaised, isMuted, trackHandRaised} from '../lib/client_hooks';
import CallsSession from '../lib/pages/calls_session';
import {getChannelNamesForTest, getUserStoragesForTest} from '../utils';

test.beforeEach(async ({page}) => {
    await new CallsSession(page).gotoChannel(defaultTeam, getChannelNamesForTest()[0]);
});

test.describe('keyboard shortcuts', () => {
    test.use({storageState: getUserStoragesForTest()[0]});

    test('join/leave call', async ({page}) => {
        const user = new CallsSession(page);

        // Solely needed to wait till the page has loaded.
        await expect(user.headerStartCallButton).toBeVisible();

        await user.shortcuts.joinCall();

        await user.widget.toBeVisible();

        await user.shortcuts.leaveCall();

        await user.widget.toBeHidden();
    });

    test('mute/unmute', async ({page}) => {
        const user = new CallsSession(page);
        await user.startCall();

        await user.shortcuts.toggleMute();

        let muted = await isMuted(page);
        if (muted) {
            test.fail();
            return;
        }

        await user.shortcuts.toggleMute();

        muted = await isMuted(page);
        if (!muted) {
            test.fail();
            return;
        }

        await user.leaveCall();
    });

    test('raise/lower hand', async ({page}) => {
        const user = new CallsSession(page);
        await user.startCall();

        await trackHandRaised(page);

        await user.shortcuts.toggleHand();

        let handRaised = await isHandRaised(page);
        if (!handRaised) {
            test.fail();
            return;
        }

        await user.shortcuts.toggleHand();

        handRaised = await isHandRaised(page);
        if (handRaised) {
            test.fail();
            return;
        }

        await user.leaveCall();
    });

    test('participants list toggle', async ({page}) => {
        const user = new CallsSession(page);
        await user.startCall();

        await expect(user.widget.participantsList).toBeHidden();

        await user.shortcuts.toggleParticipants();

        await expect(user.widget.participantsList).toBeVisible();

        await user.shortcuts.toggleParticipants();

        await expect(user.widget.participantsList).toBeHidden();

        await user.leaveCall();
    });

    test('accessibility conflict', async ({page}) => {
        const user = new CallsSession(page);
        await user.startCall();

        // unmute
        await user.widget.toggleMute();

        // open participants list
        await user.shortcuts.focusParticipants();

        await expect(user.widget.participantsList).toBeVisible();

        // should not mute
        await user.shortcuts.pressSpace();
        await expect(user.widget.participantsList).toBeVisible();
        let muted = await isMuted(page);
        if (muted) {
            test.fail();
            return;
        }

        // mute
        await user.shortcuts.toggleMute();

        muted = await isMuted(page);
        if (!muted) {
            test.fail();
        }
    });
});
