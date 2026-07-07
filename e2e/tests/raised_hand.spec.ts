// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {test} from '@playwright/test';

import PlaywrightDevPage from '../page';
import {
    getUsernamesForTest,
    getUserStoragesForTest,
    joinCall,
    joinCallAndPopout,
    startCall,
    startCallAndPopoutFromPage,
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

test.describe('raised hand', {tag: '@livekit'}, () => {
    test.use({storageState: getUserStoragesForTest()[0]});

    test('widget - round trip', async ({page}) => {
        const user0Page = new PlaywrightDevPage(page);
        const [_, user1Page] = await Promise.all([
            user0Page.startCall(),
            startCall(userStorages[1]),
        ]);

        // user1 raises hand; user0's widget shows it
        await user1Page.raiseHand();
        await user0Page.expectRaisedHand(usernames[1]);

        // user0 also raises; both shown in widget
        await user0Page.raiseHand();
        await user0Page.expectRaisedHand(usernames[0]);

        // user1 self-lowers via widget raise-hand button; user0's widget clears it
        await user1Page.raiseHand();
        await user0Page.expectUnRaisedHand(usernames[1]);

        await Promise.all([user0Page.leaveCall(), user1Page.leaveCall()]);
    });

    test('popout - round trip', async ({page}) => {
        const [user0Page, user0Popout] = await startCallAndPopoutFromPage(new PlaywrightDevPage(page));
        const [user1Page, user1Popout] = await joinCallAndPopout(userStorages[1]);

        // user1 raises hand from popout; user0's popout shows raised-hand indicator
        await user1Popout.raiseHandOnPopout();
        await user0Popout.expectRaisedHandOnPopout(usernames[1]);
        await user0Popout.expectRaisedHandChipOnPopout(usernames[1]);

        // user1 self-lowers from popout
        await user1Popout.lowerHandOnPopout();
        await user0Popout.expectUnRaisedHandOnPoput(usernames[1]);
        await user0Popout.expectRaisedHandChipHiddenOnPopout();

        await Promise.all([user0Page.leaveCall(), user1Page.leaveCall()]);
    });

    // MM-69158: widget participant list doesn't pick up raised-hand state for late joiners;
    // the popout version of this test (below) passes. Needs investigation.
    test.fixme('late joiner sees raised hand', async ({page}) => {
        const user0Page = new PlaywrightDevPage(page);
        const [_, user1Page] = await Promise.all([
            user0Page.startCall(),
            startCall(userStorages[1]),
        ]);

        // user1 raises hand before user2 joins
        await user1Page.raiseHand();
        await user0Page.expectRaisedHand(usernames[1]);

        // user2 joins after the hand is already raised
        const user2Page = await joinCall(userStorages[2]);

        // user2 should see user1's raised hand via initial attribute sync
        await user2Page.expectRaisedHand(usernames[1]);

        await Promise.all([user0Page.leaveCall(), user1Page.leaveCall(), user2Page.leaveCall()]);
    });

    test('popout - late joiner sees raised hand', async ({page}) => {
        const [user0Page, user0Popout] = await startCallAndPopoutFromPage(new PlaywrightDevPage(page));
        const [user1Page] = await joinCallAndPopout(userStorages[1]);

        // user1 raises hand from widget before user2 joins
        await user1Page.raiseHand();
        await user0Popout.expectRaisedHandOnPopout(usernames[1]);

        // user2 joins and opens popout
        const [user2Page, user2Popout] = await joinCallAndPopout(userStorages[2]);

        // user2's popout should show user1's existing raised hand
        await user2Popout.expectRaisedHandOnPopout(usernames[1]);

        await Promise.all([user0Page.leaveCall(), user1Page.leaveCall(), user2Page.leaveCall()]);
    });
});
