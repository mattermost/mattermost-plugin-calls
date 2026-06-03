// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@playwright/test';

import PlaywrightDevPage from '../page';
import {getUserIdxForTest, getUserStoragesForTest} from '../utils';

test.beforeEach(async ({page}) => {
    const devPage = new PlaywrightDevPage(page);
    await devPage.goto();
});

test.describe('switch call', {tag: '@livekit'}, () => {
    const userIdx = getUserIdxForTest();
    test.use({storageState: getUserStoragesForTest()[0]});

    test('exit modal - cancel button', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.startCall();

        await page.locator(`#sidebarItem_calls${userIdx + 1}`).click();

        const startCallButton = page.locator('[aria-label="channel header region"] button:has-text("Start call")');
        await expect(startCallButton).toBeVisible();
        await startCallButton.click();
        await expect(page.locator('#calls-switch-call-modal')).toBeVisible();

        await page.locator('button.switch-call-modal-cancel').click();
        await expect(page.locator('#calls-switch-call-modal')).toBeHidden();

        await devPage.leaveCall();
    });

    test('exit modal - close icon', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.startCall();

        await page.locator(`#sidebarItem_calls${userIdx + 1}`).click();

        const startCallButton = page.locator('[aria-label="channel header region"] button:has-text("Start call")');
        await expect(startCallButton).toBeVisible();
        await startCallButton.click();
        await expect(page.locator('#calls-switch-call-modal')).toBeVisible();

        await page.locator('button.switch-call-modal-close').click();
        await expect(page.locator('#calls-switch-call-modal')).toBeHidden();

        await devPage.leaveCall();
    });

    test('exit modal - esc key', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.startCall();

        await page.locator(`#sidebarItem_calls${userIdx + 1}`).click();

        const startCallButton = page.locator('[aria-label="channel header region"] button:has-text("Start call")');
        await expect(startCallButton).toBeVisible();
        await startCallButton.click();
        await expect(page.locator('#calls-switch-call-modal')).toBeVisible();

        await page.keyboard.press('Escape');
        await expect(page.locator('#calls-switch-call-modal')).toBeHidden();

        await devPage.leaveCall();
    });

    test('exit modal - click outside', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.startCall();

        await page.locator(`#sidebarItem_calls${userIdx + 1}`).click();

        const startCallButton = page.locator('[aria-label="channel header region"] button:has-text("Start call")');
        await expect(startCallButton).toBeVisible();
        await startCallButton.click();
        await expect(page.locator('#calls-switch-call-modal')).toBeVisible();

        await page.mouse.click(0, 0);
        await expect(page.locator('#calls-switch-call-modal')).toBeHidden();

        await devPage.leaveCall();
    });

    // MM-68570: retried after MM-69018 and MM-69019 landed, still fails the
    // same way — clicking the switch-call modal's "Join" closes the modal but
    // the new channel's widget never mounts (leave button isn't visible after
    // 150s). This is a switch-call-specific gap in the leave-old → join-new
    // transition, not a hydration or end-call issue. Needs its own follow-up.
    test.fixme('join call', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.startCall();

        await page.locator(`#sidebarItem_calls${userIdx + 1}`).click();

        const startCallButton = page.locator('[aria-label="channel header region"] button:has-text("Start call")');
        await expect(startCallButton).toBeVisible();
        await startCallButton.click();
        await expect(page.locator('#calls-switch-call-modal')).toBeVisible();

        await page.locator('button.switch-call-modal-join').click();
        await expect(page.locator('#calls-switch-call-modal')).toBeHidden();

        await devPage.leaveCall();
    });
});
