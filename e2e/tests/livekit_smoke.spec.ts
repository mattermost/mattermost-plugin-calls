// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@playwright/test';

import {adminState, baseURL} from '../constants';
import PlaywrightDevPage from '../page';
import {getUserStoragesForTest} from '../utils';

const userStorages = getUserStoragesForTest();

test.describe('livekit framework smoke', {tag: '@livekit-smoke'}, () => {
    test.describe('admin console exposes LiveKit configuration', () => {
        test.use({storageState: adminState.storageStatePath});

        test('LiveKit URL field renders', async ({page}) => {
            await page.goto(`${baseURL}/admin_console/plugins/plugin_com.mattermost.calls`);

            // The Calls header rendering proves the plugin booted without a fatal
            // config error when MM_CALLS_LIVE_KIT_* env vars are applied.
            await expect(page.locator('.admin-console__header')).toContainText('Calls');

            // The LiveKit URL field is the user-facing surface for the LiveKitURL
            // config field. We don't assert on its value here: MM_CALLS_LIVE_KIT_*
            // env overrides apply in-memory inside the plugin process (so the call
            // flow sees them) but the admin UI reads the DB-backed config, which
            // is empty in this CI setup by design. The end-to-end call test below
            // is what proves the env values actually reach the plugin.
            await expect(page.getByTestId('PluginSettings.Plugins.com+mattermost+calls.livekiturlinput')).toBeVisible();
        });
    });

    test.describe('end-to-end call via LiveKit', () => {
        test.use({storageState: userStorages[0]});

        test('user can join and leave a call', async ({page}) => {
            const devPage = new PlaywrightDevPage(page);
            await devPage.goto();

            // Click the channel header start-call button.
            const startCallButton = page.locator('#calls-join-button');
            await expect(startCallButton).toBeVisible();
            await startCallButton.click();

            // The widget appearing + loading overlay clearing means the plugin's
            // token endpoint returned a valid LiveKit URL+JWT and the browser
            // completed the LiveKit room handshake.
            await expect(page.locator('#calls-widget')).toBeVisible();
            await expect(page.getByTestId('calls-widget-loading-overlay')).toBeHidden();

            // Confirm the underlying LiveKit room reached the 'connected' state.
            // This is what proves the end-to-end LiveKit URL/API key/API secret
            // plumbing works — a token signed with the wrong secret, or a server
            // the browser can't reach, would never get here.
            await page.waitForFunction(() => window.callsClient?.room?.state === 'connected');

            // The widget joins regular channels muted (auto-unmute only triggers in
            // DM/GM channels). Toggle the mic so an audio track gets published, then
            // verify it actually shows up in localParticipant.audioTrackPublications.
            // This proves the WebRTC negotiation isn't stuck halfway.
            await page.locator('#voice-mute-unmute').click();
            await page.waitForFunction(() => (window.callsClient?.room?.localParticipant?.audioTrackPublications?.size ?? 0) > 0);

            // Leave cleanly via the widget menu and confirm the widget disappears.
            await page.locator('#calls-widget-leave-button').click();
            await page.getByTestId('dropdownmenu').getByText('Leave call').click();
            await expect(page.locator('#calls-widget')).toBeHidden();
        });
    });
});
