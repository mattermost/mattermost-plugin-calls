// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {test} from '@playwright/test';

import {defaultTeam} from '../constants';
import CallsSession from '../lib/pages/calls_session';
import {joinCallAsNewUser} from '../lib/sessions';
import {getChannelNamesForTest, getUsernamesForTest, getUserStoragesForTest, wait} from '../utils';

const userStorages = getUserStoragesForTest();
const usernames = getUsernamesForTest();
const channelName = getChannelNamesForTest()[0];

test.beforeEach(async ({page}) => {
    await new CallsSession(page).gotoChannel(defaultTeam, channelName);
});

test.describe('slash commands', () => {
    test.use({storageState: getUserStoragesForTest()[0]});

    test('end call', async ({page}) => {
        const user0 = new CallsSession(page);
        await user0.startCall();

        await user0.endCallWithSlashCommand();

        await user0.toHaveNoCallIndicators(channelName);
    });

    test('end call as second host', async ({page}) => {
        const user0 = new CallsSession(page);

        // Here we are potentially introducing flakiness since the host is the first user to join
        // and through the Promise.all() call both users join in parallel.
        // That said, in one case (the second user) we have to spawn a new browser process,
        // so we are am assuming the first user will consistently beat that, guaranteeing the order.
        const [, user1] = await Promise.all([
            user0.startCall(),
            joinCallAsNewUser(userStorages[1]),
        ]);

        await user0.sendSlashCommand(`/call host @${usernames[1]}`);
        await wait(1000);
        await user0.widget.toHaveHost(usernames[1]);

        await user1.endCallWithSlashCommand();

        await user0.toHaveNoCallIndicators(channelName);
    });
});
