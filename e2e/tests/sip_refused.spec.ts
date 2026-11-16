// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@playwright/test';

import PlaywrightDevPage from '../page';
import {getUserStoragesForTest} from '../utils';

// The SIPp sink (e2e/docker/sipp/uas.xml) refuses the INVITE instead of answering it:
// +15550486xxx gets 486 Busy Here and +15550603xxx gets 603 Decline. LiveKit reports both
// as USER_REJECTED, which the server turns into a "declined" call outcome. Comprehensive
// SIP coverage is tracked in MM-69369.
test.describe('SIP refused calls', {tag: '@sip'}, () => {
    test.use({storageState: getUserStoragesForTest()[0]});

    test.beforeEach(async ({page}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.goto();
    });

    for (const [name, prefix] of [['busy (486)', '+15550486'], ['declined (603)', '+15550603']]) {
        test(`${name} shows the call declined message`, async ({page}) => {
            const devPage = new PlaywrightDevPage(page);

            // Random suffix so parallel tests don't dial the same number.
            const number = `${prefix}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

            await devPage.sendSlashCommand(`/call dial ${number}`);

            const modal = page.locator('.modal-content');
            await expect(modal).toContainText('Call declined');
            await expect(modal).toContainText('The number you called is busy or declined the call.');
            await modal.getByRole('button', {name: 'Understood'}).click();

            // The refused call is cleaned up, not left ringing.
            await expect(modal).toBeHidden();
            await expect(page.locator('#calls-widget')).toBeHidden();
        });
    }
});
