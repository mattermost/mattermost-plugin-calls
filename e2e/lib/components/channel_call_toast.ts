// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, type Locator, type Page} from '@playwright/test';

export default class ChannelCallToast {
    readonly container: Locator;
    readonly dismissButton: Locator;

    constructor(page: Page) {
        this.container = page.locator('#calls-channel-toast');
        this.dismissButton = page.locator('.toast__dismiss');
    }

    async toBeVisible() {
        await expect(this.container).toBeVisible();
    }

    async toBeHidden() {
        await expect(this.container).toBeHidden();
    }

    async dismiss() {
        await this.dismissButton.click();
    }

    // Clicking the toast joins the call.
    async join() {
        await this.container.click();
    }
}
