// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {ChannelsPage} from '@mattermost/playwright-lib';
import {errors, expect, type Locator, type Page} from '@playwright/test';

import {waitForCallsClientConnected} from '../client_hooks';
import CallWidget from '../components/call_widget';
import CallsSidebar from '../components/calls_sidebar';
import ChannelCallToast from '../components/channel_call_toast';

// One user's page, with the Calls UI layered on the lib's ChannelsPage.
export default class CallsSession {
    readonly page: Page;
    readonly channelsPage: ChannelsPage;
    readonly widget: CallWidget;
    readonly toast: ChannelCallToast;
    readonly sidebar: CallsSidebar;
    readonly joinButton: Locator;
    readonly confirmEndCallButton: Locator;

    constructor(page: Page) {
        this.page = page;
        this.channelsPage = new ChannelsPage(page);
        this.widget = new CallWidget(page);
        this.toast = new ChannelCallToast(page);
        this.sidebar = new CallsSidebar(this.channelsPage.sidebarLeft);

        // Lib gap (11.4.0): ChannelsHeader has no call button.
        this.joinButton = page.locator('#calls-join-button');
        this.confirmEndCallButton = page.locator('.modal-content').getByRole('button', {name: 'Understood'});
    }

    async gotoChannel(teamName: string, channelName: string) {
        await this.channelsPage.goto(teamName, channelName);
        await this.channelsPage.toBeVisible();
    }

    async startCall() {
        await expect(this.joinButton).toBeVisible();
        await this.joinButton.click();
        await waitForCallsClientConnected(this.page);
        await this.widget.toBeVisible();
    }

    // Same click as startCall; the server decides based on whether a call is running.
    async joinCall() {
        await this.startCall();
    }

    async sendSlashCommand(command: string) {
        await this.channelsPage.centerView.postCreate.postMessage(command);
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

    // /call end cleans up all indicators of a running call.
    async toHaveNoCallIndicators(channelName: string) {
        await this.widget.toBeHidden();
        await this.toast.toBeHidden();
        await this.sidebar.toHaveNoActiveCall(channelName);
    }
}
