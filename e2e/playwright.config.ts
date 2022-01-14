import {PlaywrightTestConfig, devices} from '@playwright/test';

const config: PlaywrightTestConfig = {
    globalSetup: require.resolve('./global-setup'),
    globalTeardown: require.resolve('./global-teardown'),
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 2 : 1,
    workers: 4,
    timeout: 60 * 1000,
    expect: {
        timeout: 30 * 1000,
        toMatchSnapshot: {threshold: 0.2},
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
