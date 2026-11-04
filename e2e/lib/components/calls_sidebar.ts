// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {ChannelsSidebarLeft} from '@mattermost/playwright-lib';
import {expect, type Locator} from '@playwright/test';

// Calls indicators rendered inside the core left sidebar.
// Lib gap (11.4.0): ChannelsSidebarLeft has no getter for a single channel item.
export default class CallsSidebar {
    readonly sidebarLeft: ChannelsSidebarLeft;

    constructor(sidebarLeft: ChannelsSidebarLeft) {
        this.sidebarLeft = sidebarLeft;
    }

    channelItem(channelName: string): Locator {
        return this.sidebarLeft.container.locator(`#sidebarItem_${channelName}`);
    }

    activeCallIcon(channelName: string): Locator {
        return this.channelItem(channelName).getByTestId('calls-sidebar-active-call-icon');
    }

    async toHaveNoActiveCall(channelName: string) {
        await expect(this.activeCallIcon(channelName)).toBeHidden();
    }
}
