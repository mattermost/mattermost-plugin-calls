// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, type Locator, type Page} from '@playwright/test';

export default class ChannelCallToast {
    readonly container: Locator;

    constructor(page: Page) {
        this.container = page.locator('#calls-channel-toast');
    }

    async toBeHidden() {
        await expect(this.container).toBeHidden();
    }
}
