/* eslint-disable no-process-env */

import {devices, PlaywrightTestConfig} from '@playwright/test';

const config: PlaywrightTestConfig = {
    globalSetup: require.resolve('./global-setup'),
    globalTeardown: require.resolve('./global-teardown'),
    forbidOnly: Boolean(process.env.CI),
    retries: 1,
    workers: 4,
    fullyParallel: true,
    timeout: 120 * 1000,
    expect: {
        timeout: 60 * 1000,
        toMatchSnapshot: {
            maxDiffPixelRatio: 0.05,
        },
    },
    reportSlowTests: {
        max: 5,
        threshold: 120 * 1000,
    },
    use: {
        viewport: {width: 1280, height: 720},
        trace: 'retain-on-failure',
        launchOptions: {
            args: [
                '--use-fake-device-for-media-stream',
                '--use-fake-ui-for-media-stream',
                '--auto-select-desktop-capture-source="Entire screen"',
                '--use-file-for-fake-audio-capture=./assets/sample.wav',
            ],
        },

        // Unfortunately waitForFunction is flaky and randomly returns CSP failures.
        // (https://github.com/microsoft/playwright/issues/7395)
        bypassCSP: true,
    },
    projects: process.env.CI ? [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
            },
        },
        {
            name: 'webkit',
        },
    ] : [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
            },
        },
    ],
    reporter: process.env.CI ? [
        ['html', {open: 'never'}],
        ['json', {outputFile: 'pw-results.json'}],
        ['list'],
    ] : 'list',
};
export default config;
