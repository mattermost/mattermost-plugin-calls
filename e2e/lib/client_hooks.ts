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

export async function isMuted(page: Page) {
    return page.evaluate(() => {
        return !window.callsClient.audioTrack || !window.callsClient.audioTrack.enabled;
    });
}

// Records raise/lower hand events on window.isHandRaised so isHandRaised can read them.
export async function trackHandRaised(page: Page) {
    await page.evaluate(() => {
        window.callsClient.on('raise_hand', () => {
            window.isHandRaised = true;
        });

        window.callsClient.on('lower_hand', () => {
            window.isHandRaised = false;
        });
    });
}

export async function isHandRaised(page: Page) {
    return page.evaluate(() => {
        return window.isHandRaised;
    });
}
