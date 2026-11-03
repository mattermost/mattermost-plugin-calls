// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {ChannelsPost} from '@mattermost/playwright-lib';
import {expect, type Locator, type Page} from '@playwright/test';

// The custom call post ("call thread" card) rendered inside a lib ChannelsPost.
export default class CallPost {
    readonly post: ChannelsPost;
    readonly card: Locator;
    readonly joinButton: Locator;
    readonly leaveButton: Locator;
    readonly leaveMenu: Locator;

    constructor(page: Page, post: ChannelsPost) {
        this.post = post;
        this.card = post.container.getByTestId('call-thread');
        this.joinButton = post.body.locator('button:has-text("Join call")');
        this.leaveButton = post.body.getByRole('button', {name: 'Leave'});
        this.leaveMenu = page.getByTestId('dropdownmenu');
    }

    async join() {
        await expect(this.joinButton).toBeVisible();
        await this.joinButton.click();
    }

    async leave() {
        await expect(this.leaveButton).toBeVisible();
        await this.leaveButton.click();
        await this.leaveMenu.getByText('Leave call').click();
    }

    async endCallForEveryone() {
        await expect(this.leaveButton).toBeVisible();
        await this.leaveButton.click();
        await this.leaveMenu.getByText('End call for everyone').click();
    }

    // Replaces the starter's username in the card text so snapshots don't depend on
    // which worker (and so which user) ran the test.
    async maskStarterName(username: string) {
        const textEl = this.post.body.getByText(`by ${username}`);
        await expect(textEl).toBeVisible();
        await textEl.evaluate((el, name) => {
            if (el.textContent) {
                el.textContent = el.textContent.replace(name, 'testuser');
            }
        }, username);
    }
}
