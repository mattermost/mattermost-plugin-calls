import {expect, Page} from '@playwright/test';

import {baseURL, defaultTeam} from './constants';

export default class PlaywrightDevPage {
    readonly page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    async goto() {
        const idx = parseInt(process.env.TEST_PARALLEL_INDEX as string, 10) * 2;
        const channel = `calls${idx}`;
        await this.page.goto(`${baseURL}/${defaultTeam}/channels/${channel}`);
    }

    async gotoDM(username: string) {
        await this.page.goto(`${baseURL}/${defaultTeam}/messages/@${username}`);
    }

    async leaveCall() {
        await expect(this.page.locator('#calls-widget-leave-button')).toBeVisible();
        await this.page.locator('#calls-widget-leave-button').click();
        await expect(this.page.locator('#calls-widget')).toBeHidden();
    }

    async startCall() {
        const startCallButton = this.page.locator('[aria-label="channel header region"] button:has-text("Start Call")');
        await expect(startCallButton).toBeVisible();
        await startCallButton.click();
        await expect(this.page.locator('#calls-widget')).toBeVisible();
    }

    async joinCall() {
        const joinCallButton = this.page.locator('[aria-label="channel header region"] button:has-text("Join Call")');
        await expect(joinCallButton).toBeVisible();
        await joinCallButton.click();
        await expect(this.page.locator('#calls-widget')).toBeVisible();
    }

    async enableCalls() {
        const channelHeaderButton = this.page.locator('#channelHeaderDropdownButton');
        await expect(channelHeaderButton).toBeVisible();
        await channelHeaderButton.click();
        const enableCallsButton = this.page.locator('#channelHeaderDropdownMenu button:has-text("Enable Calls")');
        await expect(enableCallsButton).toBeVisible();
        await enableCallsButton.click();
    }

    async disableCalls() {
        const channelHeaderButton = this.page.locator('#channelHeaderDropdownButton');
        await expect(channelHeaderButton).toBeVisible();
        await channelHeaderButton.click();
        const disableCallsButton = this.page.locator('#channelHeaderDropdownMenu button:has-text("Disable Calls")');
        await expect(disableCallsButton).toBeVisible();
        await disableCallsButton.click();
    }

    wait(ms: number) {
        return new Promise((res) => {
            setTimeout(() => res(true), ms);
        });
    }
}
