// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {errors, expect, type Locator, type Page} from '@playwright/test';

export default class CallWidget {
    readonly container: Locator;
    readonly loadingOverlay: Locator;
    readonly participantsButton: Locator;
    readonly participantsCount: Locator;
    readonly participantsList: Locator;
    readonly hostParticipant: Locator;
    readonly hostBadge: Locator;
    readonly muteButton: Locator;
    readonly expandButton: Locator;
    readonly leaveButton: Locator;
    readonly leaveMenu: Locator;
    readonly participantJoinedNotification: Locator;

    constructor(page: Page) {
        this.container = page.locator('#calls-widget');
        this.loadingOverlay = page.getByTestId('calls-widget-loading-overlay');
        this.participantsButton = page.locator('#calls-widget-participants-button');
        this.participantsCount = this.participantsButton.locator('span');
        this.participantsList = page.locator('#calls-widget-participants-list');
        this.hostParticipant = this.participantsList.getByTestId('participant-list-host');
        this.hostBadge = this.hostParticipant.getByTestId('participant-list-host-badge');
        this.muteButton = page.locator('#voice-mute-unmute');
        this.expandButton = page.locator('#calls-widget-expand-button');
        this.leaveButton = page.locator('#calls-widget-leave-button');
        this.leaveMenu = page.getByTestId('dropdownmenu');
        this.participantJoinedNotification = page.getByTestId('call-joined-participant-notification');
    }

    async toBeVisible() {
        await expect(this.container).toBeVisible();
        await expect(this.loadingOverlay).toBeHidden();
    }

    async toBeHidden() {
        await expect(this.container).toBeHidden();
    }

    async openParticipantsList() {
        if (!await this.participantsList.isVisible()) {
            await this.participantsButton.click();
        }
        await expect(this.participantsList).toBeVisible();
    }

    async toHaveHost(name: string) {
        await this.openParticipantsList();
        await expect(this.hostParticipant).toContainText(name);
        await expect(this.hostBadge).toBeVisible();
    }

    async toggleMute() {
        await expect(this.muteButton).toBeVisible();
        await this.muteButton.click();
    }

    async leave() {
        await this.leaveButton.click();

        // The leave control is either a plain button that disconnects on click, or a
        // dot menu that needs a second click on 'Leave call'. We can't tell which one
        // we got from here, so give the menu a short window to render.
        try {
            await this.leaveMenu.getByText('Leave call').click({timeout: 2000});
        } catch (err) {
            if (!(err instanceof errors.TimeoutError)) {
                throw err;
            }
        }
    }

    async endCallForEveryone() {
        await this.leaveButton.click();
        await this.leaveMenu.getByText('End call for everyone').click();
    }
}
