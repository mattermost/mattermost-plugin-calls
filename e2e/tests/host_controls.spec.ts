import {expect, test} from '@playwright/test';

import PlaywrightDevPage from '../page';
import {getUsernamesForTest, getUserStoragesForTest, joinCall, startCall} from '../utils';

const userStorages = getUserStoragesForTest();
const usernames = getUsernamesForTest();

test.beforeEach(async ({page, context}) => {
    const devPage = new PlaywrightDevPage(page);
    await devPage.goto();
});

test.describe('host controls', () => {
    test.use({storageState: getUserStoragesForTest()[0]});

    test('host change', async ({page}) => {
        test.setTimeout(200000);
        const user0Page = await startCall(userStorages[0]);
        const user1Page = await joinCall(userStorages[1]);
        const user2Page = await joinCall(userStorages[2]);

        await user0Page.page.locator('#calls-widget-participants-button').click();
        const participantsList = user0Page.page.locator('#calls-widget-participants-list');
        await expect(participantsList).toBeVisible();

        // Call starter is host.
        await expect(user0Page.page.getByTestId('participant-list-host')).toContainText(usernames[0]);
        await expect(user0Page.page.getByTestId('participant-list-host').getByTestId('participant-list-host-badge')).toBeVisible();

        // Host can change to another.
        await user0Page.sendSlashCommand(`/call host ${usernames[1]}`);
        await user0Page.wait(1000);
        await expect(user0Page.page.getByTestId('participant-list-host')).toContainText(usernames[1]);

        // Non-host cannot change the host.
        await user0Page.sendSlashCommand(`/call host ${usernames[2]}`);
        const postContent = user0Page.page.locator('.post__content', {has: user0Page.page.locator('.post__visibility', {hasText: '(Only visible to you)'})});
        await expect(postContent).toBeVisible();
        await expect(postContent).toContainText('Error: no permissions');
        await expect(user0Page.page.getByTestId('participant-list-host')).toContainText(usernames[1]);

        // When the host leaves, the longest member becomes host.
        await user1Page.leaveCall();
        await user0Page.wait(1000);
        await expect(user0Page.page.getByTestId('participant-list-host')).toContainText(usernames[0]);

        // When the assigned host returns, the designated host regains host control.
        await joinCall(userStorages[1]);
        await user0Page.wait(1000);
        await expect(user0Page.page.getByTestId('participant-list-host')).toContainText(usernames[1]);
    });
});
