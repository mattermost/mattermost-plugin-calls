import {expect, test} from '@playwright/test';

import PlaywrightDevPage, {HostControlAction, HostNotice} from '../page';
import {
    getUsernamesForTest,
    getUserStoragesForTest,
    joinCall,
    joinCallAndPopout,
    startCall,
    startCallAndPopout,
} from '../utils';

const userStorages = getUserStoragesForTest();
const usernames = getUsernamesForTest();

test.setTimeout(400000);

test.beforeEach(async ({page}) => {
    const devPage = new PlaywrightDevPage(page);
    await devPage.goto();
});
test.afterEach(async ({page}) => {
    const devPage = new PlaywrightDevPage(page);
    await devPage.slashCallEnd();
});

test.describe('host controls', () => {
    test.use({storageState: getUserStoragesForTest()[0]});

    test('host change', async () => {
        const user0Page = await startCall(userStorages[0]);
        let user1Page = await joinCall(userStorages[1]);
        const user2Page = await joinCall(userStorages[2]);

        await user0Page.page.locator('#calls-widget-participants-button').click();
        const participantsList = user0Page.page.locator('#calls-widget-participants-list');
        await expect(participantsList).toBeVisible();

        // Call starter is host.
        await expect(user0Page.page.getByTestId('participant-list-host')).toContainText(usernames[0]);
        await expect(user0Page.page.getByTestId('participant-list-host').getByTestId('participant-list-host-badge')).toBeVisible();

        // Host can change to another.
        await user0Page.sendSlashCommand(`/call host ${usernames[1]}`);
        await user0Page.wait(1000);
        await expect(user0Page.page.getByTestId('participant-list-host')).toContainText(usernames[1]);

        // Non-host cannot change the host.
        await user0Page.sendSlashCommand(`/call host ${usernames[2]}`);
        const postContent = user0Page.page.locator('.post__content', {has: user0Page.page.locator('.post__visibility', {hasText: '(Only visible to you)'})});
        await expect(postContent).toBeVisible();
        await expect(postContent).toContainText('Error: no permissions');
        await expect(user0Page.page.getByTestId('participant-list-host')).toContainText(usernames[1]);

        // When the host leaves, the longest member becomes host.
        await user1Page.leaveCall();
        await user0Page.wait(1000);
        await expect(user0Page.page.getByTestId('participant-list-host')).toContainText(usernames[0]);

        // When the assigned host returns, the designated host regains host control.
        user1Page = await joinCall(userStorages[1]);
        await user0Page.wait(1000);
        await expect(user0Page.page.getByTestId('participant-list-host')).toContainText(usernames[1]);

        await user0Page.leaveCall();
        await user1Page.leaveCall();
        await user2Page.leaveCall();
    });

    test('widget', async () => {
        const user0Page = await startCall(userStorages[0]);
        let user1Page = await joinCall(userStorages[1]);

        //
        // HOST CHANGE
        //

        // Host should be user 0
        await user0Page.expectHostToBe(usernames[0]);

        // host change snapshot
        expect(await (await user0Page.getDropdownMenu(usernames[1])).screenshot()).toMatchSnapshot('host-change-menu-widget.png');
        await user0Page.closeDropdownMenu();

        // Can change to user 1
        await user0Page.clickHostControlOnWidget(usernames[1], HostControlAction.MakeHost);
        await user0Page.expectHostToBe(usernames[1]);
        await user0Page.expectNotice(HostNotice.HostChanged, usernames[1]);
        await user1Page.expectNotice(HostNotice.HostChanged, 'You');

        // Own host notice says "You"
        await user1Page.leaveCall();
        await user0Page.expectNotice(HostNotice.HostChanged, 'You');

        // Returning host notice is shown
        user1Page = await joinCall(userStorages[1]);
        await user0Page.expectNotice(HostNotice.HostChanged, usernames[1]);
        await user1Page.expectNotice(HostNotice.HostChanged, 'You');

        // Reset host to 0
        await user1Page.clickHostControlOnWidget(usernames[0], HostControlAction.MakeHost);

        //
        // MUTE
        //
        // 1 unmutes
        await user1Page.unmute();
        await user0Page.expectMuted(usernames[1], false);

        // mute snapshot
        expect(await (await user0Page.getDropdownMenu(usernames[1])).screenshot()).toMatchSnapshot('mute-menu-widget.png');
        await user0Page.closeDropdownMenu();

        // mute 1
        await user0Page.clickHostControlOnWidget(usernames[1], HostControlAction.Mute);
        await user0Page.expectMuted(usernames[1], true);

        //
        // MUTE OTHERS
        //
        const user2Page = await joinCall(userStorages[2]);

        // all unmute
        await user0Page.unmute();
        await user1Page.unmute();
        await user2Page.unmute();
        await user0Page.expectMuted(usernames[0], false);
        await user0Page.expectMuted(usernames[1], false);
        await user0Page.expectMuted(usernames[2], false);

        // mute others snapshot
        expect(await (await user0Page.getWidgetParticipantList()).screenshot()).toMatchSnapshot('mute-others-widget.png');

        // mute others
        await user0Page.muteOthers();
        await user0Page.expectMuted(usernames[0], false);
        await user0Page.expectMuted(usernames[1], true);
        await user0Page.expectMuted(usernames[2], true);

        //
        // LOWER HAND
        //
        // 1 raises hand
        await user1Page.raiseHand();
        await user0Page.expectRaisedHand(usernames[1]);

        // lower hand snapshot
        expect(await (await user0Page.getDropdownMenu(usernames[1])).screenshot()).toMatchSnapshot('lower-hand-widget.png');
        await user0Page.closeDropdownMenu();

        // Lower 1's hand
        await user0Page.clickHostControlOnWidget(usernames[1], HostControlAction.LowerHand);
        await user0Page.expectUnRaisedHand(usernames[1]);
        await user1Page.expectNotice(HostNotice.LowerHand, usernames[0]);

        //
        // REMOVE FROM CALL
        //

        // remove from call snapshot
        expect(await (await user0Page.getDropdownMenu(usernames[1])).screenshot()).toMatchSnapshot('remove-widget.png');
        await user0Page.closeDropdownMenu();

        // 0 removes 1
        await user0Page.clickHostControlOnWidget(usernames[1], HostControlAction.Remove);
        await user0Page.expectNotice(HostNotice.Removed, usernames[1]);

        // remove notice/modal snapshots
        await user0Page.wait(1000);
        expect(await (user1Page.page.locator('#call-error-modal').locator('.modal-content').screenshot())).toMatchSnapshot('removed-error-modal.png');

        await user1Page.expectRemovedModal();

        //
        // STOP SCREENSHARE
        //
        await user2Page.shareScreen();
        await user0Page.expectScreenShared();

        // stop screenshare snapshot
        expect(await (await user0Page.getDropdownMenu(usernames[2])).screenshot()).toMatchSnapshot('stop-screenshare-widget.png');
        await user0Page.closeDropdownMenu();

        // 0 stops 2's screenshare
        await user0Page.clickHostControlOnWidget(usernames[2], HostControlAction.StopScreenshare);
        await user0Page.wait(1000);
        await expect(user0Page.page.locator('#screen-player')).toBeHidden();
        await expect(user2Page.page.locator('#screen-player')).toBeHidden();

        await user0Page.leaveCall();
        await user2Page.leaveCall();
    });

    test('popout - participant card - make host', async () => {
        const [user0Page, user0Popout] = await startCallAndPopout(userStorages[0]);
        // eslint-disable-next-line prefer-const
        let [user1Page, user1Popout] = await joinCallAndPopout(userStorages[1]);

        //
        // MAKE HOST
        //
        // Host should be user 0
        await user0Popout.expectHostToBeOnPopout(usernames[0]);
        await user1Popout.expectHostToBeOnPopout(usernames[0]);

        // host change snapshot
        expect(await (await user0Popout.getDropdownMenuOnPopout(usernames[1])).screenshot()).toMatchSnapshot('host-change-menu-popout.png');
        await user0Popout.closeDropdownMenuOnPopout();

        // Can change to user 1
        await user0Popout.clickHostControlOnPopout(usernames[1], HostControlAction.MakeHost);
        await user0Popout.expectHostToBeOnPopout(usernames[1]);
        await user1Popout.expectHostToBeOnPopout(usernames[1]);
        await user0Popout.expectNoticeOnPopout(HostNotice.HostChanged, usernames[1]);

        // Own host notice says "You"
        await user1Popout.expectNoticeOnPopout(HostNotice.HostChanged, 'You');

        // 1 leaves
        await user1Page.leaveCall();
        await user0Popout.expectNoticeOnPopout(HostNotice.HostChanged, 'You');

        // 1 returns; returning host notice is shown
        user1Page = await joinCall(userStorages[1]);
        await user0Popout.expectNoticeOnPopout(HostNotice.HostChanged, usernames[1]);
        await user1Page.expectNotice(HostNotice.HostChanged, 'You');

        await user0Page.leaveCall();
        await user1Page.leaveCall();
    });

    test('popout - participant card - mute, lower hand', async () => {
        const [user0Page, user0Popout] = await startCallAndPopout(userStorages[0]);
        // eslint-disable-next-line prefer-const
        let [user1Page, user1Popout] = await joinCallAndPopout(userStorages[1]);

        //
        // MUTE
        //
        // 1 unmutes
        await user1Page.unmute();
        await user0Popout.expectMutedOnPopout(usernames[1], false);
        await user1Popout.expectMutedOnPopout(usernames[1], false);

        // mute snapshot
        expect(await (await user0Popout.getDropdownMenuOnPopout(usernames[1])).screenshot()).toMatchSnapshot('mute-menu-popout.png');
        await user0Popout.closeDropdownMenuOnPopout();

        // mute 1
        await user0Popout.clickHostControlOnPopout(usernames[1], HostControlAction.Mute);
        await user0Popout.expectMutedOnPopout(usernames[1], true);
        await user1Popout.expectMutedOnPopout(usernames[1], true);

        //
        // LOWER HAND
        //
        // 1 raises hand
        await user1Page.raiseHand();
        await user0Popout.expectRaisedHandOnPopout(usernames[1]);

        // lower hand snapshot
        expect(await (await user0Popout.getDropdownMenuOnPopout(usernames[1])).screenshot()).toMatchSnapshot('lower-hand-popout.png');
        await user0Popout.closeDropdownMenuOnPopout();

        // Lower 1's hand
        await user0Popout.clickHostControlOnPopout(usernames[1], HostControlAction.LowerHand);
        await user0Popout.expectUnRaisedHandOnPoput(usernames[1]);
        await user1Popout.expectNoticeOnPopout(HostNotice.LowerHand, usernames[0]);

        await user0Page.leaveCall();
        await user1Page.leaveCall();
    });

    test('popout - participant card - remove, stop screenshare', async () => {
        const [user0Page, user0Popout] = await startCallAndPopout(userStorages[0]);
        // eslint-disable-next-line prefer-const
        let [user1Page, user1Popout] = await joinCallAndPopout(userStorages[1]);

        //
        // REMOVE FROM CALL
        //
        // remove from call snapshot
        expect(await (await user0Popout.getDropdownMenuOnPopout(usernames[1])).screenshot()).toMatchSnapshot('remove-popout.png');
        await user0Popout.closeDropdownMenuOnPopout();

        // 0 removes 1
        await user0Popout.clickHostControlOnPopout(usernames[1], HostControlAction.Remove);
        await user0Popout.expectNoticeOnPopout(HostNotice.Removed, usernames[1]);

        await user1Page.expectRemovedModal();

        //
        // STOP SCREENSHARING
        //
        [user1Page, user1Popout] = await joinCallAndPopout(userStorages[1]);
        await user1Page.shareScreen();
        await user0Popout.expectScreenSharedOnPopout();

        // 0 stops 1's screenshare
        await user0Page.clickHostControlOnWidget(usernames[1], HostControlAction.StopScreenshare);
        await user0Popout.wait(1000);
        await expect(user0Popout.page.locator('#screen-player')).toBeHidden();
        await expect(user1Popout.page.locator('#screen-player')).toBeHidden();

        await user0Page.leaveCall();
        await user1Page.leaveCall();
    });

    test('popout - RHS - make host', async () => {
        const [user0Page, user0Popout] = await startCallAndPopout(userStorages[0]);
        // eslint-disable-next-line prefer-const
        let [user1Page, user1Popout] = await joinCallAndPopout(userStorages[1]);

        await user0Popout.openRHSOnPopout();
        await user1Popout.openRHSOnPopout();

        //
        // MAKE HOST
        //
        // Host should be user 0
        await user0Popout.expectHostToBeOnPopout(usernames[0]);
        await user1Popout.expectHostToBeOnPopout(usernames[0]);

        // host change snapshot
        expect(await (await user0Popout.getDropdownMenuOnPopoutRHS(usernames[1])).screenshot()).toMatchSnapshot('host-change-menu-popout-rhs.png');
        await user0Popout.closeDropdownMenuOnPopoutRHS(usernames[1]);

        // move mouse
        await user0Popout.closeDropdownMenuOnPopoutRHS(usernames[0]);

        // Can change to user 1
        await user0Popout.clickHostControlOnPopoutRHS(usernames[1], HostControlAction.MakeHost);
        await user0Popout.expectHostToBeOnPopout(usernames[1]);
        await user1Popout.expectHostToBeOnPopout(usernames[1]);
        await user0Popout.expectNoticeOnPopout(HostNotice.HostChanged, usernames[1]);

        // Own host notice says "You"
        await user1Popout.expectNoticeOnPopout(HostNotice.HostChanged, 'You');

        // 1 leaves
        await user1Page.leaveCall();
        await user0Popout.expectNoticeOnPopout(HostNotice.HostChanged, 'You');

        // 1 returns; returning host notice is shown
        user1Page = await joinCall(userStorages[1]);
        await user0Popout.expectNoticeOnPopout(HostNotice.HostChanged, usernames[1]);
        await user1Page.expectNotice(HostNotice.HostChanged, 'You');

        await user0Page.leaveCall();
        await user1Page.leaveCall();
    });

    test('popout - RHS - mute, lower hand', async () => {
        const [user0Page, user0Popout] = await startCallAndPopout(userStorages[0]);
        // eslint-disable-next-line prefer-const
        let [user1Page, user1Popout] = await joinCallAndPopout(userStorages[1]);

        await user0Popout.openRHSOnPopout();
        await user1Popout.openRHSOnPopout();

        //
        // MUTE
        //
        // 1 unmutes
        await user1Page.unmute();
        await user0Popout.expectMutedOnPopout(usernames[1], false);
        await user1Popout.expectMutedOnPopout(usernames[1], false);

        // mute snapshot
        expect(await (await user0Popout.getDropdownMenuOnPopoutRHS(usernames[1])).screenshot()).toMatchSnapshot('mute-menu-popout-rhs.png');
        await user0Popout.closeDropdownMenuOnPopoutRHS(usernames[1]);

        // move mouse
        await user0Popout.closeDropdownMenuOnPopoutRHS(usernames[0]);

        // mute 1
        await user0Popout.clickHostControlOnPopoutRHS(usernames[1], HostControlAction.Mute);
        await user0Popout.expectMutedOnPopout(usernames[1], true);
        await user1Popout.expectMutedOnPopout(usernames[1], true);

        //
        // LOWER HAND
        //
        // 1 raises hand
        await user1Page.raiseHand();
        await user0Popout.expectRaisedHandOnPopout(usernames[1]);

        // lower hand snapshot
        expect(await (await user0Popout.getDropdownMenuOnPopoutRHS(usernames[1])).screenshot()).toMatchSnapshot('lower-hand-popout-rhs.png');
        await user0Popout.closeDropdownMenuOnPopoutRHS(usernames[1]);

        // move mouse
        await user0Popout.closeDropdownMenuOnPopoutRHS(usernames[0]);

        // Lower 1's hand
        await user0Popout.clickHostControlOnPopoutRHS(usernames[1], HostControlAction.LowerHand);
        await user0Popout.expectUnRaisedHandOnPoput(usernames[1]);
        await user1Popout.expectNoticeOnPopout(HostNotice.LowerHand, usernames[0]);

        //
        // MUTE OTHERS
        //
        const user2Page = await joinCall(userStorages[2]);

        // all unmute
        await user0Page.unmute();
        await user1Page.unmute();
        await user2Page.unmute();
        await user0Popout.expectMutedOnPopout(usernames[0], false);
        await user0Popout.expectMutedOnPopout(usernames[1], false);
        await user0Popout.expectMutedOnPopout(usernames[2], false);

        // mute others snapshot
        expect(await (user0Popout.page.getByTestId('rhs-participant-list-header')).screenshot()).toMatchSnapshot('mute-others-popout-rhs.png');

        // mute others
        await user0Popout.muteOthersOnPopoutRHS();
        await user0Popout.expectMutedOnPopout(usernames[0], false);
        await user0Popout.expectMutedOnPopout(usernames[1], true);
        await user0Popout.expectMutedOnPopout(usernames[2], true);

        await user0Page.leaveCall();
        await user1Page.leaveCall();
        await user2Page.leaveCall();
    });

    test('popout - RHS - remove, stop screenshare', async () => {
        const [user0Page, user0Popout] = await startCallAndPopout(userStorages[0]);
        // eslint-disable-next-line prefer-const
        let [user1Page, user1Popout] = await joinCallAndPopout(userStorages[1]);

        await user0Popout.openRHSOnPopout();
        await user1Popout.openRHSOnPopout();

        //
        // REMOVE FROM CALL
        //
        // remove from call snapshot
        expect(await (await user0Popout.getDropdownMenuOnPopoutRHS(usernames[1])).screenshot()).toMatchSnapshot('remove-popout-rhs.png');
        await user0Popout.closeDropdownMenuOnPopoutRHS(usernames[1]);

        // move mouse
        await user0Popout.closeDropdownMenuOnPopoutRHS(usernames[0]);

        // 0 removes 1
        await user0Popout.clickHostControlOnPopoutRHS(usernames[1], HostControlAction.Remove);
        await user0Popout.expectNoticeOnPopout(HostNotice.Removed, usernames[1]);
        await user1Page.expectRemovedModal();

        //
        // STOP SCREENSHARING
        //
        [user1Page, user1Popout] = await joinCallAndPopout(userStorages[1]);
        await user1Popout.openRHSOnPopout();

        await user1Page.shareScreen();
        await user0Popout.expectScreenSharedOnPopout();

        // stop screenshare snapshot
        expect(await (await user0Popout.getDropdownMenuOnPopoutRHS(usernames[1])).screenshot()).toMatchSnapshot('stop-screenshare-popout-rhs.png');
        await user0Popout.closeDropdownMenuOnPopoutRHS(usernames[1]);

        // move mouse
        await user0Popout.closeDropdownMenuOnPopoutRHS(usernames[0]);

        // 0 stops 1's screenshare
        await user0Popout.clickHostControlOnPopoutRHS(usernames[1], HostControlAction.StopScreenshare);
        await user0Popout.wait(1000);
        await expect(user0Popout.page.locator('#screen-player')).toBeHidden();
        await expect(user1Popout.page.locator('#screen-player')).toBeHidden();

        await user0Page.leaveCall();
        await user1Page.leaveCall();
    });
});
