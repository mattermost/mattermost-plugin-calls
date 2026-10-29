// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Page} from '@playwright/test';

// Wrappers over the window.callsClient test hooks. Specs must not call page.evaluate or
// page.waitForFunction directly; add a wrapper here instead.

export async function waitForCallsClientConnected(page: Page) {
    await page.waitForFunction(() => window.callsClient && window.callsClient.connected && !window.callsClient.closed);
}

export async function waitForCallsClientClosed(page: Page) {
    await page.waitForFunction(() => !window.callsClient || window.callsClient.closed);
}
