// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@playwright/test';

import PlaywrightDevPage from '../page';
import {findSIPRoom, newRoomServiceClient, randomNumber} from '../sip';
import {getUserStoragesForTest} from '../utils';

// The plugin's managed trunk points at the SIPp sink (see prepare-server.sh), which
// auto-answers every INVITE. Comprehensive SIP coverage is tracked in MM-69369.
test.describe('SIP outbound dial', {tag: '@sip'}, () => {
    test.use({storageState: getUserStoragesForTest()[0]});

    test.beforeEach(async ({page}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.goto();
    });

    test('dialing a number connects the phone leg, and ending the call hangs it up', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);
        const rooms = newRoomServiceClient();

        // Outside the number ranges the sink treats specially (answer, then BYE or refuse),
        // so it answers and keeps the call up until we end it.
        const number = randomNumber('+1555123', 4);

        await test.step('dial connects', async () => {
            await devPage.sendSlashCommand(`/call dial ${number}`);

            await expect(page.locator('#calls-widget')).toBeVisible();
            await expect(page.getByTestId('calls-widget-loading-overlay')).toBeHidden();

            // The title reads "Calling {number}…" until the SIP leg is answered, then just the number.
            await expect(page.getByTestId('calls-widget-phone-call-title')).toHaveText(number);

            // The SIP leg is in the call's LiveKit room until the call ends.
            await expect.poll(() => findSIPRoom(rooms, number)).not.toBe('');
        });

        await test.step('ending the call from Mattermost hangs up the SIP leg', async () => {
            await devPage.slashCallEnd();
            await expect(page.locator('#calls-widget')).toBeHidden();

            // Ending the call tears down the room, which makes the bridge BYE the sink.
            await expect.poll(() => findSIPRoom(rooms, number)).toBe('');
        });
    });
});
