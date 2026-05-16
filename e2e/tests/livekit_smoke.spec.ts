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

            // Widget visible + loading overlay hidden is the UI signal that the
            // CallClient reached CONNECTED — clientConnecting flips false on that
            // event, and the widget unmounts on connect errors, so getting here
            // proves the plugin's token endpoint returned a valid URL+JWT and
            // the browser completed the LiveKit room handshake.
            await expect(page.locator('#calls-widget')).toBeVisible();
            await expect(page.getByTestId('calls-widget-loading-overlay')).toBeHidden();

            // Joining a regular channel starts muted (auto-unmute only fires in
            // DM/GM channels), so the mic button's aria-label is "Unmute". Click
            // it and assert it flips to "Mute". The flip requires the round-trip
            // to land: setMicrophoneEnabled(true) publishes the audio track to
            // LiveKit → server marks the session unmuted → broadcasts via WS →
            // redux updates `currentSession.unmuted` → button re-renders. A
            // half-negotiated track or a stuck WS would leave the label as
            // "Unmute".
            const muteButton = page.locator('#voice-mute-unmute');
            await expect(muteButton).toHaveAttribute('aria-label', 'Unmute');
            await muteButton.click();
            await expect(muteButton).toHaveAttribute('aria-label', 'Mute');

            // Leave cleanly via the widget menu and confirm the widget disappears.
            await page.locator('#calls-widget-leave-button').click();
            await page.getByTestId('dropdownmenu').getByText('Leave call').click();
            await expect(page.locator('#calls-widget')).toBeHidden();
        });
    });
});
