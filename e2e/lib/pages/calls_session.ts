// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {ChannelsPage} from '@mattermost/playwright-lib';
import {errors, expect, type Locator, type Page} from '@playwright/test';

import {waitForCallsClientClosed, waitForCallsClientConnected} from '../client_hooks';
import CallPost from '../components/call_post';
import CallWidget from '../components/call_widget';
import CallsProfilePopover from '../components/calls_profile_popover';
import CallsShortcuts from '../components/calls_shortcuts';
import CallsSidebar from '../components/calls_sidebar';
import ChannelCallToast from '../components/channel_call_toast';
import ExpandedView from '../components/expanded_view';
import SwitchCallModal from '../components/switch_call_modal';

// One user's page, with the Calls UI layered on the lib's ChannelsPage.
export default class CallsSession {
    readonly page: Page;
    readonly channelsPage: ChannelsPage;
    readonly widget: CallWidget;
    readonly toast: ChannelCallToast;
    readonly sidebar: CallsSidebar;
    readonly switchCallModal: SwitchCallModal;
    readonly shortcuts: CallsShortcuts;
    readonly joinButton: Locator;
    readonly headerStartCallButton: Locator;
    readonly confirmEndCallButton: Locator;

    constructor(page: Page) {
        this.page = page;
        this.channelsPage = new ChannelsPage(page);
        this.widget = new CallWidget(page);
        this.toast = new ChannelCallToast(page);
        this.sidebar = new CallsSidebar(this.channelsPage.sidebarLeft);
        this.switchCallModal = new SwitchCallModal(page);
        this.shortcuts = new CallsShortcuts(page);

        // Lib gap (11.4.0): ChannelsHeader has no call button.
        this.joinButton = page.locator('#calls-join-button');
        this.headerStartCallButton = page.locator('[aria-label="channel header region"] button:has-text("Start call")');
        this.confirmEndCallButton = page.locator('.modal-content').getByRole('button', {name: 'Understood'});
    }

    // Navigation only, like the original page.ts goto; callers wait on what they need next.
    async gotoChannel(teamName: string, channelName: string) {
        await this.channelsPage.goto(teamName, channelName);
    }

    async gotoDM(teamName: string, username: string) {
        await this.channelsPage.goto(teamName, `@${username}`);
    }

    async goToSidebarChannel(channelName: string) {
        await this.channelsPage.sidebarLeft.goToItem(channelName);
    }

    async postMessage(message: string) {
        await this.channelsPage.centerView.postCreate.postMessage(message);
    }

    async scrollToLastPost() {
        const post = await this.channelsPage.centerView.getLastPost();
        await post.body.scrollIntoViewIfNeeded();
    }

    async getLastCallPost() {
        return new CallPost(this.page, await this.channelsPage.centerView.getLastPost());
    }

    async openProfilePopoverOnLastPost() {
        const post = await this.channelsPage.centerView.getLastPost();
        return new CallsProfilePopover(await this.channelsPage.openProfilePopover(post));
    }

    // Matches the original page.ts startCall: it does not wait for the loading overlay.
    // Waiting for it changes test timing (e.g. synchronises two users' leave clicks).
    async startCall() {
        await expect(this.joinButton).toBeVisible();
        await this.joinButton.click();
        await waitForCallsClientConnected(this.page);
        await expect(this.widget.container).toBeVisible();
    }

    // Same click as startCall; the server decides based on whether a call is running.
    async joinCall() {
        await this.startCall();
    }

    async clickHeaderStartCall() {
        await expect(this.headerStartCallButton).toBeVisible();
        await this.headerStartCallButton.click();
    }

    async leaveCall() {
        await this.widget.leave();
        await waitForCallsClientClosed(this.page);
        await this.widget.toBeHidden();
    }

    async startCallAndPopout() {
        await this.startCall();
        const [popOut] = await Promise.all([
            this.page.context().waitForEvent('page'),
            this.widget.expandButton.click(),
        ]);
        return new ExpandedView(popOut);
    }

    async sendSlashCommand(command: string) {
        await this.postMessage(command);
    }

    async endCallWithSlashCommand() {
        await this.sendSlashCommand('/call end');

        // The confirmation modal only shows up in some cases, so we give it a
        // short window to render and treat its absence as fine. Anything other
        // than a timeout is a real failure.
        try {
            await this.confirmEndCallButton.click({timeout: 2000});
        } catch (err) {
            if (!(err instanceof errors.TimeoutError)) {
                throw err;
            }
        }
    }

    // Ending a call cleans up all indicators of a running call.
    async toHaveNoCallIndicators(channelName: string) {
        await this.widget.toBeHidden();
        await this.toast.toBeHidden();
        await this.sidebar.toHaveNoActiveCall(channelName);
    }
}
