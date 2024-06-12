import {expect, Page} from '@playwright/test';

import {apiGetGroupChannel} from './channels';
import {baseURL, defaultTeam, pluginID} from './constants';
import {getChannelNamesForTest} from './utils';

// eslint-disable-next-line no-shadow
export enum HostControlAction {
    Mute = 'Mute participant',
    StopScreenshare = 'Stop screen share',
    LowerHand = 'Lower hand',
    MakeHost = 'Make host',
    Remove = 'Remove from call',
}

// eslint-disable-next-line no-shadow
export enum HostNotice {
    LowerHand = 'notice-lower-hand',
    HostChanged = 'notice-host-changed',
    Removed = 'notice-removed',
}

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
        await this.leaveFromWidget();
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

    async slashCallEnd() {
        await this.sendSlashCommand('/call end');
        let modal = this.page.locator('#calls-end-call-modal');
        if (await modal.isVisible()) {
            await modal.getByRole('button', {name: 'End call'}).click();
        } else {
            modal = this.page.locator('.modal-content');
            if (await modal.isVisible()) {
                await modal.getByRole('button', {name: 'Understood'}).click();
            }
        }
    }

    async joinCall() {
        const joinCallButton = this.page.locator('#calls-join-button');
        await expect(joinCallButton).toBeVisible();
        await joinCallButton.click();
        await this.page.waitForFunction(() => window.callsClient && window.callsClient.connected && !window.callsClient.closed);
        await expect(this.page.locator('#calls-widget')).toBeVisible();
    }

    async openPopout() {
        const [popOut, _] = await Promise.all([
            this.page.context().waitForEvent('page'),
            this.page.click('#calls-widget-expand-button'),
        ]);
        return new PlaywrightDevPage(popOut);
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

    async expectHostToBe(name: string) {
        const list = await this.getWidgetParticipantList();
        await expect(list).toBeVisible();

        await expect(this.page.getByTestId('participant-list-host')).toContainText(name);
        await expect(this.page.getByTestId('participant-list-host').getByTestId('participant-list-host-badge')).toBeVisible();
    }

    async expectHostToBeOnPopout(name: string) {
        await expect(this.page.getByTestId('host-badge').locator('..')).toContainText(name);
    }

    async getDropdownMenu(name: string) {
        const list = await this.getWidgetParticipantList();
        await expect(list).toBeVisible();
        await list.getByText(name).hover();
        await list.getByTestId('three-dots-button').click();
        return list.getByTestId('dropdownmenu');
    }

    async closeDropdownMenu() {
        const list = await this.getWidgetParticipantList();
        await expect(list).toBeVisible();
        return list.locator('.MenuHeader').click();
    }

    async clickHostControlOnWidget(name: string, action: HostControlAction) {
        const menu = await this.getDropdownMenu(name);
        await menu.getByText(action).click();

        if (action === HostControlAction.Remove) {
            const banner = this.page.getByTestId('calls-widget-banner-remove');
            await expect(banner).toBeVisible();
            await banner.getByText('Yes, remove').click();
        }

        // wait for the roundtrip and update
        await this.wait(500);
    }

    async getDropdownMenuOnPopout(name: string) {
        const list = this.page.locator('#calls-expanded-view-participants-grid');
        await list.getByText(name).hover();
        await list.getByTestId('menuButtonHost controls').click();
        return list.getByTestId('dropdownmenu');
    }

    async closeDropdownMenuOnPopout() {
        const list = this.page.getByTestId('calls-expanded-view-top-container');
        await list.click();
    }

    async clickHostControlOnPopout(name: string, action: HostControlAction) {
        const menu = await this.getDropdownMenuOnPopout(name);
        await menu.getByText(action).click();

        if (action === HostControlAction.Remove) {
            const banner = this.page.getByTestId('remove-confirmation');
            await expect(banner).toBeVisible();
            await banner.getByText('Yes, remove').click();
        }

        // wait for the roundtrip and update
        await this.wait(500);
    }

    async getDropdownMenuOnPopoutRHS(name: string) {
        const list = this.page.getByTestId('rhs-participant-list');
        await list.getByText(name).hover();
        await list.getByTestId('menuButtonHost controls').click();
        return list.getByTestId('dropdownmenu');
    }

    async closeDropdownMenuOnPopoutRHS(name: string) {
        const list = this.page.getByTestId('rhs-participant-list');
        await list.getByText(name).click();
    }

    async clickHostControlOnPopoutRHS(name: string, action: HostControlAction) {
        await this.openRHSOnPopout();
        const menu = await this.getDropdownMenuOnPopoutRHS(name);
        await menu.getByText(action).click();

        if (action === HostControlAction.Remove) {
            const banner = this.page.getByTestId('remove-confirmation');
            await expect(banner).toBeVisible();
            await banner.getByText('Yes, remove').click();
        }

        // wait for the roundtrip and update
        await this.wait(500);
    }

    async getWidgetParticipantList() {
        if (!await this.page.locator('#calls-widget-participants-list').isVisible()) {
            await this.page.locator('#calls-widget-participants-button').click();
        }
        return this.page.locator('#calls-widget-participants-list');
    }

    async muteOthers() {
        const list = await this.getWidgetParticipantList();
        await expect(list).toBeVisible();
        await list.getByRole('button', {name: 'Mute others'}).click();
    }

    async muteOthersOnPopoutRHS() {
        const list = this.page.getByTestId('rhs-participant-list');
        await list.getByRole('button', {name: 'Mute others'}).click();
    }

    async expectNotice(notice: HostNotice, name: string) {
        await expect(this.page.getByTestId(notice).first()).toContainText(name);
    }

    async expectNoticeOnPopout(notice: HostNotice, name: string) {
        await expect(this.page.getByTestId(notice).last()).toContainText(name);
    }

    async raiseHand() {
        await this.page.locator('#raise-hand').click();
    }

    async expectRaisedHand(name: string) {
        const list = await this.getWidgetParticipantList();
        await expect(list).toBeVisible();
        await expect(list.getByText(name).locator('..').getByTestId('raised-hand')).toBeVisible();
    }

    async expectRaisedHandOnPopout(name: string) {
        const list = this.page.locator('#calls-expanded-view-participants-grid');
        await expect(list.getByText(name).locator('..').getByTestId('raised-hand')).toBeVisible();
    }

    async expectUnRaisedHand(name: string) {
        const list = await this.getWidgetParticipantList();
        await expect(list).toBeVisible();
        await expect(list.getByText(name).locator('..').getByTestId('raised-hand')).toBeHidden();
    }

    async expectUnRaisedHandOnPoput(name: string) {
        const list = this.page.locator('#calls-expanded-view-participants-grid');
        await expect(list.getByText(name).locator('..').getByTestId('raised-hand')).toBeHidden();
    }

    async expectMuted(name: string, muted: boolean) {
        const list = await this.getWidgetParticipantList();
        await expect(list).toBeVisible();
        await expect(list.getByText(name).locator('..').getByTestId(muted ? 'muted' : 'unmuted')).toBeVisible();
    }

    async expectMutedOnPopout(name: string, muted: boolean) {
        const list = this.page.locator('#calls-expanded-view-participants-grid');
        await expect(list.getByText(name).locator('..').getByTestId(muted ? 'muted' : 'unmuted')).toBeVisible();
    }

    async expectRemovedModal() {
        const modalHeader = this.page.locator('#call-error-modal');
        await expect(modalHeader).toBeVisible();
        await expect(modalHeader).toContainText('You were removed from the call');
        await modalHeader.getByRole('button', {name: 'Close'}).click();
    }

    async shareScreen() {
        await this.page.locator('#calls-widget-toggle-menu-button').click();
        await this.page.locator('#calls-widget-menu-screenshare').click();

        await expect(this.page.locator('#screen-player')).toBeVisible();
    }

    async expectScreenShared() {
        await expect(this.page.locator('#screen-player')).toBeVisible();

        const screenStreamID = await (await this.page.waitForFunction(() => {
            return window.callsClient.getRemoteScreenStream()?.getVideoTracks()[0]?.id;
        })).evaluate(() => {
            return window.callsClient.getRemoteScreenStream()?.getVideoTracks()[0]?.id;
        });
        expect(screenStreamID).toContain('screen_');
    }

    async expectScreenSharedOnPopout() {
        await expect(this.page.locator('#screen-player')).toBeVisible();

        const screenStreamID = await (await this.page.waitForFunction(() => {
            const callsClient = window.opener ? window.opener.callsClient : window.callsClient;
            return callsClient.getRemoteScreenStream()?.getVideoTracks()[0]?.id;
        })).evaluate(() => {
            const callsClient = window.opener ? window.opener.callsClient : window.callsClient;
            return callsClient.getRemoteScreenStream()?.getVideoTracks()[0]?.id;
        });
        expect(screenStreamID).toContain('screen_');
    }

    async openRHSOnPopout() {
        if (!await this.page.getByTestId('rhs-participant-list').isVisible()) {
            await this.page.locator('#calls-popout-participants-button').click();
        }
        await expect(this.page.getByTestId('rhs-participant-list')).toBeVisible();
    }

    async closeRHSOnPopout() {
        if (await this.page.getByTestId('rhs-participant-list').isVisible()) {
            await this.page.locator('#calls-popout-participants-button').click();
        }
        await expect(this.page.getByTestId('rhs-participant-list')).toBeHidden();
    }

    async leaveFromPopout() {
        await this.page.locator('#calls-popout-leave-button').click();
        const menu = this.page.getByTestId('dropdownmenu');
        await menu.getByText('Leave call').click();
    }

    async leaveFromWidget() {
        await this.page.locator('#calls-widget-leave-button').click();
        const menu = this.page.getByTestId('dropdownmenu');
        await menu.getByText('Leave call').click();
    }
}
