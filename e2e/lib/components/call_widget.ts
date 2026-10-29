// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, type Locator, type Page} from '@playwright/test';

export default class CallWidget {
    readonly container: Locator;
    readonly loadingOverlay: Locator;
    readonly participantsButton: Locator;
    readonly participantsList: Locator;
    readonly hostParticipant: Locator;
    readonly hostBadge: Locator;

    constructor(page: Page) {
        this.container = page.locator('#calls-widget');
        this.loadingOverlay = page.getByTestId('calls-widget-loading-overlay');
        this.participantsButton = page.locator('#calls-widget-participants-button');
        this.participantsList = page.locator('#calls-widget-participants-list');
        this.hostParticipant = this.participantsList.getByTestId('participant-list-host');
        this.hostBadge = this.hostParticipant.getByTestId('participant-list-host-badge');
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
}
