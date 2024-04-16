import {expect, Page} from '@playwright/test';

import {apiGetGroupChannel} from './channels';
import {baseURL, defaultTeam, pluginID} from './constants';
import {getChannelNamesForTest} from './utils';

export default class PlaywrightDevPage {
    readonly page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    async goto() {
        await this.page.goto(`${baseURL}/${defaultTeam}/channels/${getChannelNamesForTest()[0]}`);
    }

    async goToChannel(name: string) {
        await this.page.goto(`${baseURL}/${defaultTeam}/channels/${name}`);
    }

    async gotoDM(username: string) {
        await this.page.goto(`${baseURL}/${defaultTeam}/messages/@${username}`);
    }

    // Assuming user only has one GM channel during the test, for simplicity
    async getGMChannel(userName: string) {
        return apiGetGroupChannel(this.page.request, userName);
    }

    async goToGM(userName: string) {
        const channel = await this.getGMChannel(userName);
        await this.page.goto(`${baseURL}/${defaultTeam}/channels/${channel.name}`);
        return channel;
    }

    async leaveCall() {
        await this.page.locator('#calls-widget-leave-button').click();
        await this.page.waitForFunction(() => !window.callsClient || window.callsClient.closed);
        await expect(this.page.locator('#calls-widget')).toBeHidden();
    }

    async startCall() {
        const startCallButton = this.page.locator('#calls-join-button');
        await expect(startCallButton).toBeVisible();
        await startCallButton.click();
        await this.page.waitForFunction(() => window.callsClient && window.callsClient.connected && !window.callsClient.closed);
        await expect(this.page.locator('#calls-widget')).toBeVisible();
    }

    async joinCall() {
        const joinCallButton = this.page.locator('#calls-join-button');
        await expect(joinCallButton).toBeVisible();
        await joinCallButton.click();
        await this.page.waitForFunction(() => window.callsClient && window.callsClient.connected && !window.callsClient.closed);
        await expect(this.page.locator('#calls-widget')).toBeVisible();
    }

    async enableCalls() {
        const channelHeaderButton = this.page.locator('#channelHeaderDropdownButton');
        await expect(channelHeaderButton).toBeVisible();
        await channelHeaderButton.click();
        const enableCallsButton = this.page.locator('#channelHeaderDropdownMenu button:has-text("Enable calls")');
        await expect(enableCallsButton).toBeVisible();
        await enableCallsButton.click();
    }

    async disableCalls() {
        const channelHeaderButton = this.page.locator('#channelHeaderDropdownButton');
        await expect(channelHeaderButton).toBeVisible();
        await channelHeaderButton.click();
        const disableCallsButton = this.page.locator('#channelHeaderDropdownMenu button:has-text("Disable calls")');
        await expect(disableCallsButton).toBeVisible();
        await disableCallsButton.click();
    }

    wait(ms: number) {
        return new Promise((res) => {
            setTimeout(() => res(true), ms);
        });
    }

    async openWidget(channelName: string) {
        const resp = await this.page.request.get(`${baseURL}/api/v4/teams/name/${defaultTeam}/channels/name/${channelName}`);
        const channel = await resp.json();

        await this.page.goto(`${baseURL}/plugins/${pluginID}/standalone/widget.html?call_id=${channel.id}`);
        await expect(this.page.locator('#calls-widget')).toBeVisible();
        await expect(this.page.getByTestId('calls-widget-loading-overlay')).toBeHidden();
    }

    async hideDocument(hide = true) {
        await this.page.evaluate((hidden) => {
            Object.defineProperty(document, 'visibilityState', {value: hidden ? 'hidden' : 'visible', writable: true});
            Object.defineProperty(document, 'hidden', {value: hidden, writable: true});
            document.dispatchEvent(new Event('visibilitychange'));
        }, hide);
    }

    async expectNotifications(numDesktopNotificationsRejected: number, numDesktopNotificationsSent: number, numNotificationsSounded: number, numNotificationsStoppedAt: number) {
        const desktopNotificationsRejected = await this.page.evaluate(() => {
            return window.e2eDesktopNotificationsRejected || [];
        });
        const notificationsSoundedAt = await this.page.evaluate(() => {
            return window.e2eNotificationsSoundedAt || [];
        });
        const desktopNotificationsSent = await this.page.evaluate(() => {
            return window.e2eDesktopNotificationsSent || [];
        });
        const notificationsSoundStoppedAt = await this.page.evaluate(() => {
            return window.e2eNotificationsSoundStoppedAt || [];
        });
        await expect(desktopNotificationsRejected.length).toEqual(numDesktopNotificationsRejected);
        await expect(desktopNotificationsSent.length).toEqual(numDesktopNotificationsSent);
        await expect(notificationsSoundedAt.length).toEqual(numNotificationsSounded);
        await expect(notificationsSoundStoppedAt.length).toEqual(numNotificationsStoppedAt);
    }

    async unmute() {
        await this.page.locator('#voice-mute-unmute').click();
    }

    async sendSlashCommand(cmd: string) {
        await this.page.locator('#post_textbox').fill(cmd);
        await this.page.getByTestId('SendMessageButton').click();
    }
}
