// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, type Locator, type Page} from '@playwright/test';

// The popout (expanded) call window.
export default class ExpandedView {
    readonly page: Page;
    readonly container: Locator;
    readonly leaveButton: Locator;
    readonly leaveMenu: Locator;

    constructor(page: Page) {
        this.page = page;
        this.container = page.locator('#calls-expanded-view');
        this.leaveButton = page.locator('#calls-popout-leave-button');
        this.leaveMenu = page.getByTestId('dropdownmenu');
    }

    async toBeVisible() {
        await expect(this.container).toBeVisible();
    }

    async endCallForEveryone() {
        await this.leaveButton.click();
        await this.leaveMenu.getByText('End call for everyone').click();
    }
}
