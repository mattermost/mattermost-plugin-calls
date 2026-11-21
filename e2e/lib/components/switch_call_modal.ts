// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, type Locator, type Page} from '@playwright/test';

// Shown when starting or joining a call while already in another one.
export default class SwitchCallModal {
    readonly page: Page;
    readonly container: Locator;
    readonly cancelButton: Locator;
    readonly closeButton: Locator;
    readonly joinButton: Locator;

    constructor(page: Page) {
        this.page = page;
        this.container = page.locator('#calls-switch-call-modal');
        this.cancelButton = page.locator('button.switch-call-modal-cancel');
        this.closeButton = page.locator('button.switch-call-modal-close');
        this.joinButton = page.locator('button.switch-call-modal-join');
    }

    async toBeVisible() {
        await expect(this.container).toBeVisible();
    }

    async toBeHidden() {
        await expect(this.container).toBeHidden();
    }

    async cancel() {
        await this.cancelButton.click();
    }

    async close() {
        await this.closeButton.click();
    }

    async join() {
        await this.joinButton.click();
    }

    async dismissWithEscape() {
        await this.page.keyboard.press('Escape');
    }

    async dismissByClickingOutside() {
        await this.page.mouse.click(0, 0);
    }
}
