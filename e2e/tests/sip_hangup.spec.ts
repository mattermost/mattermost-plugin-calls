// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@playwright/test';

import PlaywrightDevPage from '../page';
import {randomNumber} from '../sip';
import {getUserStoragesForTest} from '../utils';

// Numbers starting +15550009 make the SIPp sink (e2e/docker/sipp/uas.xml) send a BYE 2s
// after the ACK. Hangup from the Mattermost side is covered by sip_dial.spec.ts.
// Comprehensive SIP coverage is tracked in MM-69369.
test.describe('SIP hangup', {tag: '@sip'}, () => {
    test.use({storageState: getUserStoragesForTest()[0]});

    test.beforeEach(async ({page}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.goto();
    });

    test('BYE from the SIP side ends the call', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);
        const number = randomNumber('+15550009', 3);

        await devPage.sendSlashCommand(`/call dial ${number}`);

        await expect(page.locator('#calls-widget')).toBeVisible();
        await expect(page.getByTestId('calls-widget-phone-call-title')).toHaveText(number);

        // The callee hanging up after answering is a normal end: the call goes away
        // without an error modal.
        await expect(page.locator('#calls-widget')).toBeHidden();
        await expect(page.locator('.modal-content')).toBeHidden();
    });
});
