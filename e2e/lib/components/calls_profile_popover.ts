// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {UserProfilePopover} from '@mattermost/playwright-lib';
import type {Locator} from '@playwright/test';

// The Calls button inside the lib's user profile popover.
export default class CallsProfilePopover {
    readonly popover: UserProfilePopover;
    readonly callButton: Locator;
    readonly startCallButton: Locator;

    constructor(popover: UserProfilePopover) {
        this.popover = popover;
        this.callButton = popover.container.locator('#startCallButton');
        this.startCallButton = popover.container.getByLabel('Start call');
    }

    ongoingCallButton(username: string): Locator {
        return this.popover.container.getByLabel(`Call with ${username} is ongoing`);
    }

    async startCall() {
        await this.startCallButton.click();
    }

    async close() {
        await this.popover.close();
    }
}
