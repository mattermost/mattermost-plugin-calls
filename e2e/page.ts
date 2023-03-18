import {expect, Page} from '@playwright/test';

import {baseURL, defaultTeam} from './constants';

import {getChannelNamesForTest} from './utils';

export default class PlaywrightDevPage {
    readonly page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    async goto() {
        await this.page.goto(`${baseURL}/${defaultTeam}/channels/${getChannelNamesForTest()[0]}`);
    }

    async goToChannel(name: string) {
        await this.page.goto(`${baseURL}/${defaultTeam}/channels/${name}`);
    }

    async gotoDM(username: string) {
        await this.page.goto(`${baseURL}/${defaultTeam}/messages/@${username}`);
    }

    async leaveCall() {
        await this.page.locator('#calls-widget-leave-button').click();
        await expect(this.page.locator('#calls-widget')).toBeHidden();
    }

    async startCall() {
        const startCallButton = this.page.locator('[aria-label="channel header region"] button:has-text("Start call")');
        await expect(startCallButton).toBeVisible();
        await startCallButton.click();
        await expect(this.page.locator('#calls-widget')).toBeVisible();
        await expect(this.page.locator('#calls-widget-loading-overlay')).toBeHidden();
    }

    async joinCall() {
        const joinCallButton = this.page.locator('[aria-label="channel header region"] button:has-text("Join call")');
        await expect(joinCallButton).toBeVisible();
        await joinCallButton.click();
        await expect(this.page.locator('#calls-widget')).toBeVisible();
        await expect(this.page.locator('#calls-widget-loading-overlay')).toBeHidden();
    }

    async enableCalls() {
        const channelHeaderButton = this.page.locator('#channelHeaderDropdownButton');
        await expect(channelHeaderButton).toBeVisible();
        await channelHeaderButton.click();
        const enableCallsButton = this.page.locator('#channelHeaderDropdownMenu button:has-text("Enable calls")');
        await expect(enableCallsButton).toBeVisible();
        await enableCallsButton.click();
    }

    async disableCalls() {
        const channelHeaderButton = this.page.locator('#channelHeaderDropdownButton');
        await expect(channelHeaderButton).toBeVisible();
        await channelHeaderButton.click();
        const disableCallsButton = this.page.locator('#channelHeaderDropdownMenu button:has-text("Disable calls")');
        await expect(disableCallsButton).toBeVisible();
        await disableCallsButton.click();
    }

    wait(ms: number) {
        return new Promise((res) => {
            setTimeout(() => res(true), ms);
        });
    }
}
