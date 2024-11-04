import {expect, test} from '@playwright/test';

import {apiSetEnableLiveCaptions, apiSetEnableTranscriptions} from '../config';
import {adminState, baseURL} from '../constants';
import {acquireLock, releaseLock, resizeAndScreenshot, wait} from '../utils';

test.describe('admin console', () => {
    test.use({storageState: adminState.storageStatePath});

    test.beforeEach(async () => {
        if (test.info().title === 'config sections') {
            test.setTimeout(200000);

            // We acquire a file system lock so that we don't cause a conflict with other
            // tests that update the config.
            await acquireLock('calls-config-lock');
        }
    });

    test.afterEach(() => {
        if (test.info().title === 'config sections') {
            releaseLock('calls-config-lock');
        }
    });

    test('config sections', async ({page}) => {
        await apiSetEnableTranscriptions(true);
        await apiSetEnableLiveCaptions(true);

        // Go to the plugin settings page.
        await page.goto(`${baseURL}/admin_console/plugins/plugin_com.mattermost.calls`);

        // Verify page header is present.
        await expect(page.locator('.admin-console__header')).toContainText('Calls');

        // Verify all sections render as expected.
        await expect(await resizeAndScreenshot(page, 'calls-general-settings-section')).toMatchSnapshot('calls-system-console-general-settings-section.png');
        await expect(await resizeAndScreenshot(page, 'calls-rtcd-service-section')).toMatchSnapshot('calls-system-console-rtcd-service-section.png');
        await expect(await resizeAndScreenshot(page, 'calls-rtc-server-section')).toMatchSnapshot('calls-system-console-rtc-server-section.png');
        await expect(await resizeAndScreenshot(page, 'calls-ice-and-turn-section')).toMatchSnapshot('calls-system-console-ice-and-turn-section.png');
        await expect(await resizeAndScreenshot(page, 'calls-recordings-section')).toMatchSnapshot('calls-system-console-recordings-section.png');
        await expect(await resizeAndScreenshot(page, 'calls-transcriptions-section')).toMatchSnapshot('calls-system-console-transcriptions-section.png');
        await expect(await resizeAndScreenshot(page, 'calls-live-captions-section')).toMatchSnapshot('calls-system-console-live-captions-section.png');
    });

    test('config settings', async ({page}) => {
        // Go to the plugin settings page.
        await page.goto(`${baseURL}/admin_console/plugins/plugin_com.mattermost.calls`);

        // Check radio input
        await page.getByTestId('PluginSettings.PluginStates.com+mattermost+calls.Enablefalse').click();

        // wait for any animation to complete
        await wait(1000);
        await expect(await resizeAndScreenshot(page, 'PluginSettings.PluginStates.com+mattermost+calls.Enable')).toMatchSnapshot('calls-system-console-enable-plugin-false.png');

        await page.getByTestId('PluginSettings.PluginStates.com+mattermost+calls.Enabletrue').click();

        // wait for any animation to complete
        await wait(1000);
        await expect(await resizeAndScreenshot(page, 'PluginSettings.PluginStates.com+mattermost+calls.Enable')).toMatchSnapshot('calls-system-console-enable-plugin-true.png');

        // Check number input
        await expect(await resizeAndScreenshot(page, 'PluginSettings.Plugins.com+mattermost+calls.maxcallparticipants')).toMatchSnapshot('calls-system-console-max-call-participants-default.png');
        await page.getByTestId('PluginSettings.Plugins.com+mattermost+calls.maxcallparticipantsnumber').fill('10');
        await expect(await resizeAndScreenshot(page, 'PluginSettings.Plugins.com+mattermost+calls.maxcallparticipants')).toMatchSnapshot('calls-system-console-max-call-participants-modified.png');

        // Check text input
        await expect(await resizeAndScreenshot(page, 'PluginSettings.Plugins.com+mattermost+calls.rtcdserviceurl')).toMatchSnapshot('calls-system-console-rtcd-url-empty.png');
        await page.getByTestId('PluginSettings.Plugins.com+mattermost+calls.rtcdserviceurlinput').fill('http://rtcd.local:8065');
        await expect(await resizeAndScreenshot(page, 'PluginSettings.Plugins.com+mattermost+calls.rtcdserviceurl')).toMatchSnapshot('calls-system-console-rtcd-url-filled.png');

        // Check textarea input
        await expect(await resizeAndScreenshot(page, 'PluginSettings.Plugins.com+mattermost+calls.iceserversconfigs')).toMatchSnapshot('calls-system-console-ice-configs-empty.png');
        await page.getByTestId('PluginSettings.Plugins.com+mattermost+calls.iceserversconfigsinput').fill('[]');
        await expect(await resizeAndScreenshot(page, 'PluginSettings.Plugins.com+mattermost+calls.iceserversconfigs')).toMatchSnapshot('calls-system-console-ice-configs-filled.png');

        // Check dropdown input
        await page.getByTestId('PluginSettings.Plugins.com+mattermost+calls.recordingqualitydropdown').selectOption('High');
        await expect(await resizeAndScreenshot(page, 'PluginSettings.Plugins.com+mattermost+calls.recordingquality')).toMatchSnapshot('calls-system-console-recording-quality.png');

        // Ensure AllowScreenSharing defaults to true
        await expect(page.getByTestId('PluginSettings.Plugins.com+mattermost+calls.allowscreensharingtrue')).toBeChecked();
        await expect(page.getByTestId('PluginSettings.Plugins.com+mattermost+calls.allowscreensharingfalse')).not.toBeChecked();
    });
});
