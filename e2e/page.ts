import {expect, Page} from '@playwright/test';

import {baseURL, defaultTeam} from './constants';

export default class PlaywrightDevPage {
    readonly page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    async goto() {
        const channel = `calls${process.env.TEST_PARALLEL_INDEX}`;
        await this.page.goto(`${baseURL}/${defaultTeam}/channels/${channel}`);
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
}
