import {PlaywrightTestConfig, devices} from '@playwright/test';

const config: PlaywrightTestConfig = {
    globalSetup: require.resolve('./global-setup'),
    globalTeardown: require.resolve('./global-teardown'),
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 2 : 0,
    expect: {
        timeout: 20 * 1000,
    },
    reportSlowTests: {
        max: 5,
        threshold: 60 * 1000,
    },
    use: {
        viewport: {width: 1280, height: 720},
        trace: 'on-first-retry',
        launchOptions: {
            args: [
                '--use-fake-device-for-media-stream',
                '--use-fake-ui-for-media-stream',
            ],
        },
    },
    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
            },
        },
    ],
};
export default config;
