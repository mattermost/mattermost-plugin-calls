// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@playwright/test';

import {defaultTeam} from '../constants';
import CallsSession from '../lib/pages/calls_session';
import {joinCallAsNewUser, openDMAsNewUser, startCallAsNewUser} from '../lib/sessions';
import {getChannelNamesForTest, getUsernamesForTest, getUserStoragesForTest} from '../utils';

const userStorages = getUserStoragesForTest();
const usernames = getUsernamesForTest();
const channelName = getChannelNamesForTest()[0];

test.beforeEach(async ({page}) => {
    await new CallsSession(page).gotoChannel(defaultTeam, channelName);
});

test.describe('join call', () => {
    test.use({storageState: userStorages[0]});

    test('channel header button', {
        tag: '@core',
    }, async ({page}) => {
        const user0 = new CallsSession(page);
        const [user1, _] = await Promise.all([startCallAsNewUser(userStorages[1]), user0.joinCall()]);

        await Promise.all([user0.leaveCall(), user1.leaveCall()]);
    });

    test('channel toast', async ({page}) => {
        const user0 = new CallsSession(page);

        // start a call
        const user1 = await startCallAsNewUser(userStorages[1]);

        await user0.scrollToLastPost();

        await user0.toast.toBeVisible();
        expect(await user0.toast.container.screenshot()).toMatchSnapshot('channel-toast.png');

        await user0.toast.join();

        await expect(user1.widget.participantJoinedNotification).toBeVisible();
        await expect(user1.widget.participantJoinedNotification).toContainText(usernames[0] + ' has joined the call.');

        await user0.widget.toBeVisible();

        await Promise.all([user0.leaveCall(), user1.leaveCall()]);
    });

    test('call thread', async ({page}) => {
        const user0 = new CallsSession(page);

        // start a call
        const user1 = await startCallAsNewUser(userStorages[1]);

        const callPost = await user0.getLastCallPost();
        await expect(callPost.joinButton).toBeVisible();

        await expect(callPost.card).toBeVisible();

        // We update the text content to make the snapshot matching consistent since usernames will vary depending on test parallelism.
        await callPost.maskStarterName(usernames[1]);

        expect(await callPost.card.screenshot()).toMatchSnapshot('call-thread-join.png');

        await callPost.join();
        await user0.widget.toBeVisible();

        expect(await callPost.card.screenshot()).toMatchSnapshot('call-thread-leave.png');

        await callPost.leave();

        await user0.widget.toBeHidden();

        await user1.leaveCall();
    });

    test('user profile popover', async ({page}) => {
        const userA = new CallsSession(page);
        await userA.gotoDM(defaultTeam, usernames[1]);

        const userB = await openDMAsNewUser(userStorages[1], usernames[0]);

        // We have both users send a message so it's much easier to
        // consistently find the proper selector to open the profile.
        await userA.postMessage('messageA');
        await userB.postMessage('messageB');

        let popover = await userA.openProfilePopoverOnLastPost();

        // Start the call with the button
        await expect(popover.startCallButton).toBeEnabled();
        await popover.startCall();

        // Verify that the call button is disabled while the call is started
        await expect(popover.ongoingCallButton(usernames[1])).toBeDisabled();

        // Close User profile overlay
        await popover.close();

        await expect(userA.widget.container).toBeVisible();

        await userA.widget.leave();
        await userA.widget.toBeHidden();

        // We then verify that call button is disabled if the other user is already in a call with us.
        await userB.startCall();

        // We have both users send a message so it's much easier to
        // consistently find the proper selector to open the profile.
        await userA.postMessage('messageA');
        await userB.postMessage('messageB');

        popover = await userA.openProfilePopoverOnLastPost();
        await expect(popover.callButton).toBeDisabled();
        await popover.close();

        await userB.leaveCall();

        // We also verify that call button is disabled if we are already in a call with the other user.
        await userA.startCall();

        // We have both users send a message so it's much easier to
        // consistently find the proper selector to open the profile.
        await userA.postMessage('messageA');
        await userB.postMessage('messageB');

        popover = await userA.openProfilePopoverOnLastPost();
        await expect(popover.callButton).toBeDisabled();
        await popover.close();

        await userA.leaveCall();
    });

    test('multiple sessions per user', {
        tag: '@core',
    }, async ({page}) => {
        const sessionA = new CallsSession(page);

        // start a call
        const [_, sessionB, sessionC] = await Promise.all([
            sessionA.startCall(),
            startCallAsNewUser(userStorages[1]),
            startCallAsNewUser(userStorages[1]),
        ]);

        // Verify there are three participants
        await expect(sessionC.widget.participantsCount).toBeVisible();
        const content = await sessionC.widget.participantsCount.textContent();
        if (content !== '3') {
            test.fail();
            return;
        }

        await Promise.all([sessionA.leaveCall(), sessionB.leaveCall(), sessionC.leaveCall()]);
    });
});

test.describe('end call', () => {
    test.use({storageState: userStorages[0]});

    test('widget', async ({page}) => {
        // userA starts a call and userB joins
        const userA = new CallsSession(page);
        const [_, userB] = await Promise.all([
            userA.startCall(),
            joinCallAsNewUser(userStorages[1]),
        ]);

        // userA ends call
        await userA.widget.endCallForEveryone();

        // verify call has ended
        await userA.toHaveNoCallIndicators(channelName);
        await userB.widget.toBeHidden();
    });

    test('post card', async ({page}) => {
        // userA starts a call and userB joins
        const userA = new CallsSession(page);
        const [_, userB] = await Promise.all([
            userA.startCall(),
            joinCallAsNewUser(userStorages[1]),
        ]);

        // userA ends call
        const callPost = await userA.getLastCallPost();
        await callPost.endCallForEveryone();

        // verify call has ended
        await userA.toHaveNoCallIndicators(channelName);
        await userB.widget.toBeHidden();
    });

    test('popout', async ({page}) => {
        const userA = new CallsSession(page);
        const popOut = await userA.startCallAndPopout();
        await popOut.toBeVisible();

        // userB joins
        const userB = await joinCallAsNewUser(userStorages[1]);

        // userA ends call
        await popOut.endCallForEveryone();

        // verify call has ended
        await userA.toHaveNoCallIndicators(channelName);
        await userB.widget.toBeHidden();
    });
});
