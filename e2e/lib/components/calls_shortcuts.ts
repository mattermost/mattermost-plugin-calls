// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Page} from '@playwright/test';

// Calls keyboard shortcuts. The modifier follows the platform the test runner is on.
export default class CallsShortcuts {
    readonly page: Page;
    readonly mod: string;

    constructor(page: Page) {
        this.page = page;
        this.mod = process.platform === 'darwin' ? 'Meta' : 'Control';
    }

    async joinCall() {
        await this.page.keyboard.press(`${this.mod}+Alt+S`);
    }

    async leaveCall() {
        await this.page.keyboard.press(`${this.mod}+Shift+L`);
    }

    async toggleMute() {
        await this.page.keyboard.press(`${this.mod}+Shift+Space`);
    }

    async toggleHand() {
        await this.page.keyboard.press(`${this.mod}+Shift+Y`);
    }

    async toggleParticipants() {
        await this.page.keyboard.press(`${this.mod}+Shift+P`);
    }

    // Accessibility shortcut for the participants list.
    async focusParticipants() {
        await this.page.keyboard.press('Alt+P');
    }

    async pressSpace() {
        await this.page.keyboard.press('Space');
    }
}
