import {expect, test} from '@playwright/test';

import {apiChannelNotifyProps} from '../channels';
import {adminState, baseURL} from '../constants';
import PlaywrightDevPage from '../page';
import {apiPatchNotifyProps, apiPutStatus} from '../users';
import {
    getChannelNamesForTest,
    getChannelURL,
    getUserIDsForTest,
    getUserIdxForTest,
    getUsernamesForTest,
    getUserStoragesForTest,
    newUserPage,
    openGM,
    startDMWith,
} from '../utils';

const userStorages = getUserStoragesForTest();
const usernames = getUsernamesForTest();
const allUserIDsInTest = getUserIDsForTest();

test.setTimeout(240 * 1000);

test.beforeEach(async ({page, request}, info) => {
    // Small optimization to avoid loading an unnecessary channel.
    if (info.title === 'system console') {
        return;
    }

    // reset user notifications and group channel notifications
    await apiPutStatus(request, 'online');
    await apiPatchNotifyProps(request, {
        desktop: 'mentions',
        calls_desktop_sound: 'true',
        auto_responder_active: 'false',
    });

    const devPage = new PlaywrightDevPage(page);
    const channel = await devPage.getGMChannel(usernames[0]);
    await apiChannelNotifyProps(request, channel.id, allUserIDsInTest[0],
        {mark_unread: 'all', desktop: 'default', desktop_sound: 'on'},
    );
    await devPage.goto();
});

test.afterEach(async ({page, request}) => {
    // reset user notifications and group channel notifications
    await apiPutStatus(request, 'online');
    const devPage = new PlaywrightDevPage(page);
    const channel = await devPage.getGMChannel(usernames[0]);
    await apiPatchNotifyProps(request, {
        desktop: 'mentions',
        calls_desktop_sound: 'true',
        auto_responder_active: 'false',
        auto_responder_message: '',
    });
    await apiChannelNotifyProps(request, channel.id, allUserIDsInTest[0],
        {mark_unread: 'all', desktop: 'default', desktop_sound: 'on'},
    );
});

test.describe('notifications', () => {
    test.use({storageState: getUserStoragesForTest()[0]});

    test('dm channel notification', async ({page}) => {
        await page.evaluate(() => {
            window.e2eDesktopNotificationsRejected = [];
            window.e2eNotificationsSoundedAt = [];
            window.e2eDesktopNotificationsSent = [];
        });

        // we need to be 'hidden' so that our desktop notifications are sent
        const devPage = new PlaywrightDevPage(page);
        await devPage.hideDocument(true);

        const user1 = await startDMWith(userStorages[1], usernames[0]);
        await user1.startCall();

        const notification = await page.getByTestId('call-incoming');
        await expect(notification).toBeVisible();
        await expect(await notification.screenshot()).toMatchSnapshot('call-incoming-notification-dm.png');
        await expect(notification).toContainText(`${usernames[1]} is inviting you to a call`);

        const desktopNotificationsRejected = await page.evaluate(() => {
            return window.e2eDesktopNotificationsRejected || [];
        });
        const notificationsSoundedAt = await page.evaluate(() => {
            return window.e2eNotificationsSoundedAt || [];
        });
        const desktopNotificationsSent = await page.evaluate(() => {
            return window.e2eDesktopNotificationsSent || [];
        });
        await expect(desktopNotificationsRejected.length).toEqual(1);
        await expect(desktopNotificationsRejected[0].body).toEqual(`@${usernames[1]}: ${usernames[1]} started a call`);
        await expect(desktopNotificationsSent.length).toEqual(1);
        await expect(desktopNotificationsSent[0]).toEqual(`${usernames[1]} is inviting you to a call`);
        await expect(notificationsSoundedAt.length).toEqual(1);
        await user1.leaveCall();
        await expect(notification).not.toBeVisible();
    });

    test('dm channel, global desktop none', async ({page, request}) => {
        await apiPatchNotifyProps(request, {desktop: 'none'});
        await page.reload();
        const devPage = new PlaywrightDevPage(page);
        await page.evaluate(() => {
            window.e2eDesktopNotificationsRejected = [];
            window.e2eNotificationsSoundedAt = [];
            window.e2eDesktopNotificationsSent = [];
        });

        // we need to be 'hidden' so that our desktop notifications are sent
        await devPage.hideDocument(true);

        const user1 = await startDMWith(userStorages[1], usernames[0]);
        await user1.startCall();

        const notification = await page.getByTestId('call-incoming');
        await expect(notification).toBeVisible();
        await expect(await notification.screenshot()).toMatchSnapshot('call-incoming-notification-dm.png');
        await expect(notification).toContainText(`${usernames[1]} is inviting you to a call`);
        await devPage.expectNotifications(0, 0, 0, 0);

        await user1.leaveCall();
        await expect(notification).not.toBeVisible();
    });

    test('dm channel, global sound false', async ({page, request}) => {
        await apiPatchNotifyProps(request, {desktop: 'mentions', calls_desktop_sound: 'false'});
        await page.reload();
        const devPage = new PlaywrightDevPage(page);
        await page.evaluate(() => {
            window.e2eDesktopNotificationsRejected = [];
            window.e2eNotificationsSoundedAt = [];
            window.e2eDesktopNotificationsSent = [];
        });

        // we need to be 'hidden' so that our desktop notifications are sent
        await devPage.hideDocument(true);

        const user1 = await startDMWith(userStorages[1], usernames[0]);
        await user1.startCall();

        const notification = await page.getByTestId('call-incoming');
        await expect(notification).toBeVisible();
        await expect(await notification.screenshot()).toMatchSnapshot('call-incoming-notification-dm.png');
        await expect(notification).toContainText(`${usernames[1]} is inviting you to a call`);
        await devPage.expectNotifications(1, 1, 0, 0);

        await user1.leaveCall();
        await expect(notification).not.toBeVisible();
    });

    test('gm channel notification', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.goto();
        await page.evaluate(() => {
            window.e2eDesktopNotificationsRejected = [];
            window.e2eNotificationsSoundedAt = [];
            window.e2eDesktopNotificationsSent = [];
        });

        // we need to be 'hidden' so that our desktop notifications are sent
        await devPage.hideDocument(true);

        const user1 = await openGM(userStorages[1], usernames[1]);
        await user1.startCall();

        const notification = await page.getByTestId('call-incoming');
        await expect(notification).toBeVisible();
        await expect(await notification.screenshot()).toMatchSnapshot('call-incoming-notification-gm.png');
        await expect(notification).toContainText(`${usernames[1]} is inviting you to a call with ${usernames[2]}`);

        const notificationsRejected = await page.evaluate(() => {
            return window.e2eDesktopNotificationsRejected || [];
        });
        const notificationsSoundedAt = await page.evaluate(() => {
            return window.e2eNotificationsSoundedAt || [];
        });
        const desktopNotificationsSent = await page.evaluate(() => {
            return window.e2eDesktopNotificationsSent || [];
        });
        await expect(notificationsRejected.length).toEqual(1);
        await expect(notificationsRejected[0].body).toEqual(`@${usernames[1]}: ${usernames[1]} started a call`);
        await expect(desktopNotificationsSent.length).toEqual(1);
        await expect(desktopNotificationsSent[0]).toEqual(`${usernames[1]} is inviting you to a call`);
        await expect(notificationsSoundedAt.length).toEqual(1);
        await user1.leaveCall();
        await expect(notification).not.toBeVisible();
    });

    test('gm channel, global desktop none', async ({page, request}) => {
        await apiPatchNotifyProps(request, {desktop: 'none'});
        await page.reload();
        const devPage = new PlaywrightDevPage(page);
        await devPage.goto();
        await page.evaluate(() => {
            window.e2eDesktopNotificationsRejected = [];
            window.e2eNotificationsSoundedAt = [];
            window.e2eDesktopNotificationsSent = [];
        });

        // we need to be 'hidden' so that our desktop notifications are sent
        await devPage.hideDocument(true);

        const user1 = await openGM(userStorages[1], usernames[1]);
        await user1.startCall();

        const notification = await page.getByTestId('call-incoming');
        await expect(notification).toBeVisible();
        await expect(await notification.screenshot()).toMatchSnapshot('call-incoming-notification-gm.png');
        await expect(notification).toContainText(`${usernames[1]} is inviting you to a call with ${usernames[2]}`);
        await devPage.expectNotifications(0, 0, 0, 0);

        await user1.leaveCall();
    });

    test('gm channel, global desktop sound false', async ({page, request}) => {
        await apiPatchNotifyProps(request, {desktop: 'mentions', calls_desktop_sound: 'false'});
        await page.reload();
        const devPage = new PlaywrightDevPage(page);
        await page.evaluate(() => {
            window.e2eDesktopNotificationsRejected = [];
            window.e2eNotificationsSoundedAt = [];
            window.e2eDesktopNotificationsSent = [];
        });

        // we need to be 'hidden' so that our desktop notifications are sent
        await devPage.hideDocument(true);

        const user1 = await openGM(userStorages[1], usernames[1]);
        await user1.startCall();

        const notification = await page.getByTestId('call-incoming');
        await expect(notification).toBeVisible();
        await expect(await notification.screenshot()).toMatchSnapshot('call-incoming-notification-gm.png');
        await expect(notification).toContainText(`${usernames[1]} is inviting you to a call with ${usernames[2]}`);
        await devPage.expectNotifications(1, 1, 0, 0);

        await user1.leaveCall();
    });

    test('two notifications stacked, do not ring for second call when first is ringing', async ({page}) => {
        await page.evaluate(() => {
            window.e2eDesktopNotificationsRejected = [];
            window.e2eNotificationsSoundedAt = [];
            window.e2eDesktopNotificationsSent = [];
            window.e2eRingLength = 150000; // in case the test takes a long time to start the second call.
        });

        // we need to be 'hidden' so that our desktop notifications are sent
        const devPage = new PlaywrightDevPage(page);
        await devPage.hideDocument(true);

        const user1 = await startDMWith(userStorages[1], usernames[0]);
        await user1.startCall();

        const user2 = await openGM(userStorages[2], usernames[2]);
        await user2.startCall();

        const notification = await page.getByTestId('call-incoming');
        await expect(notification).toBeVisible();
        await expect(notification).toContainText(`${usernames[1]} is inviting you to a call`);

        const condensedNotification = await page.getByTestId('call-incoming-condensed');
        await expect(condensedNotification).toBeVisible();
        await expect(await condensedNotification.screenshot()).toMatchSnapshot('call-incoming-condensed-notification-gm.png');
        await expect(condensedNotification).toContainText(`Call from ${usernames[2]} with ${usernames[1]}`);

        const notificationsRejected = await page.evaluate(() => {
            return window.e2eDesktopNotificationsRejected || [];
        });
        let notificationsSoundedAt = await page.evaluate(() => {
            return window.e2eNotificationsSoundedAt || [];
        });
        const desktopNotificationsSent = await page.evaluate(() => {
            return window.e2eDesktopNotificationsSent || [];
        });
        await expect(notificationsRejected.length).toEqual(2);
        await expect(notificationsRejected[0].body).toEqual(`@${usernames[1]}: ${usernames[1]} started a call`);
        await expect(notificationsRejected[1].body).toEqual(`@${usernames[2]}: ${usernames[2]} started a call`);
        await expect(desktopNotificationsSent.length).toEqual(2);
        await expect(desktopNotificationsSent[0]).toEqual(`${usernames[1]} is inviting you to a call`);
        await expect(desktopNotificationsSent[1]).toEqual(`${usernames[2]} is inviting you to a call`);
        await expect(notificationsSoundedAt.length).toEqual(1);

        // first notification will change to second call, condensed will disappear
        await user1.leaveCall();
        await expect(condensedNotification).not.toBeVisible();

        // will be replaced with the gm call's notification
        await expect(notification).toBeVisible();
        await expect(notification).toContainText(`${usernames[2]} is inviting you to a call with ${usernames[1]}`);

        await user2.leaveCall();
        await expect(notification).not.toBeVisible();

        // no new notification sound
        notificationsSoundedAt = await page.evaluate(() => {
            return window.e2eNotificationsSoundedAt || [];
        });
        await expect(notificationsSoundedAt.length).toEqual(1);
    });

    test('two notifications stacked, ring for second call when first is finished ringing', async ({page}) => {
        await page.evaluate(() => {
            window.e2eNotificationsSoundedAt = [];
            window.e2eRingLength = 500;
        });
        const user1 = await startDMWith(userStorages[1], usernames[0]);
        await user1.startCall();

        const user2 = await openGM(userStorages[2], usernames[2]);
        await user2.startCall();

        const notification = await page.getByTestId('call-incoming');
        await expect(notification).toBeVisible();
        const condensedNotification = await page.getByTestId('call-incoming-condensed');
        await expect(condensedNotification).toBeVisible();

        // second call rang
        const notificationsSoundedAt = await page.evaluate(() => {
            return window.e2eNotificationsSoundedAt || [];
        });
        await expect(notificationsSoundedAt.length).toEqual(2);

        await user1.leaveCall();
        await user2.leaveCall();
    });

    test('stacked notifications while in a call - webapp', async ({page}) => {
        await page.evaluate(() => {
            window.e2eDesktopNotificationsRejected = [];
            window.e2eNotificationsSoundedAt = [];
            window.e2eDesktopNotificationsSent = [];
        });

        const devPage = new PlaywrightDevPage(page);
        await devPage.startCall();
        await devPage.hideDocument(true);

        // Receives two incoming notifications above widget, no notifications on the webapp itself
        const user1 = await startDMWith(userStorages[1], usernames[0]);
        await user1.startCall();

        const user2 = await openGM(userStorages[2], usernames[2]);
        await user2.startCall();

        const notificationsRejected = await page.evaluate(() => {
            return window.e2eDesktopNotificationsRejected || [];
        });
        let notificationsSoundedAt = await page.evaluate(() => {
            return window.e2eNotificationsSoundedAt || [];
        });
        const desktopNotificationsSent = await page.evaluate(() => {
            return window.e2eDesktopNotificationsSent || [];
        });
        await expect(notificationsRejected.length).toEqual(2);
        await expect(notificationsRejected[0].body).toEqual(`@${usernames[1]}: ${usernames[1]} started a call`);
        await expect(notificationsRejected[1].body).toEqual(`@${usernames[2]}: ${usernames[2]} started a call`);
        await expect(desktopNotificationsSent.length).toEqual(2);
        await expect(desktopNotificationsSent[0]).toEqual(`${usernames[1]} is inviting you to a call`);
        await expect(desktopNotificationsSent[1]).toEqual(`${usernames[2]} is inviting you to a call`);
        await expect(notificationsSoundedAt.length).toEqual(0);

        const notification = await page.getByTestId('call-incoming-condensed-widget');

        // The earliest call is always closest to the widget (at the end of the list)
        await expect(notification.nth(1)).toBeVisible();
        await expect(notification.nth(1)).toContainText(`Call from ${usernames[1]}`);
        await expect(notification.nth(0)).toBeVisible();
        await expect(notification.nth(0)).toContainText(`Call from ${usernames[2]} with ${usernames[1]}`);

        // No notifications on webapp
        const webappNotification = await page.getByTestId('call-incoming');
        const webappCondensedNotification = await page.getByTestId('call-incoming-condensed');
        await expect(webappNotification).not.toBeVisible();
        await expect(webappCondensedNotification).not.toBeVisible();

        // leave my call, notifications will appear on webapp
        await devPage.leaveCall();
        await expect(webappNotification).toBeVisible();
        await expect(webappCondensedNotification).toBeVisible();

        // Do not ring "twice" (but first time we were on a call)
        notificationsSoundedAt = await page.evaluate(() => {
            return window.e2eNotificationsSoundedAt || [];
        });
        await expect(notificationsSoundedAt.length).toEqual(0);

        await user1.leaveCall();
        await user2.leaveCall();
    });

    test('stacked notifications while in a call - global widget', async ({page}) => {
        const devPage = new PlaywrightDevPage(page);
        await devPage.openWidget(getChannelNamesForTest()[0]);

        // Receives two incoming notifications above widget
        const user1 = await startDMWith(userStorages[1], usernames[0]);
        await user1.startCall();

        const user2 = await openGM(userStorages[2], usernames[2]);
        await user2.startCall();

        let notification = await page.getByTestId('call-incoming-condensed-widget');

        // The earliest call is always closest to the widget (at the end of the list)
        await expect(notification.nth(1)).toBeVisible();
        await expect(notification.nth(1)).toContainText(`Call from ${usernames[1]}`);
        await expect(notification.nth(0)).toBeVisible();
        await expect(notification.nth(0)).toContainText(`Call from ${usernames[2]} with`);

        // The notifications disappear when the calls are ended
        await user2.leaveCall();

        notification = await page.getByTestId('call-incoming-condensed-widget');
        await expect(notification).toBeVisible();
        await expect(notification).toContainText(`Call from ${usernames[1]}`);

        await user1.leaveCall();
        await expect(notification).not.toBeVisible();
    });

    test('reloading and new client, user will see notifications immediately', async ({page}) => {
        const user1 = await startDMWith(userStorages[1], usernames[0]);
        await user1.startCall();

        const user2 = await openGM(userStorages[2], usernames[2]);
        await user2.startCall();

        let notification = await page.getByTestId('call-incoming');
        await expect(notification).toBeVisible();

        let condensedNotification = await page.getByTestId('call-incoming-condensed');
        await expect(condensedNotification).toBeVisible();

        // user reloads
        const devPage = new PlaywrightDevPage(page);
        await devPage.goto();

        // and sees the two notifications waiting
        notification = await page.getByTestId('call-incoming');
        await expect(notification).toBeVisible();
        await expect(notification).toContainText(`${usernames[1]} is inviting you to a call`);

        condensedNotification = await page.getByTestId('call-incoming-condensed');
        await expect(condensedNotification).toBeVisible();
        await expect(await condensedNotification.screenshot()).toMatchSnapshot('call-incoming-condensed-notification-gm.png');
        await expect(condensedNotification).toContainText(`Call from ${usernames[2]} with ${usernames[1]}`);

        // user opens a new client
        const user0 = await newUserPage(userStorages[0]);
        await user0.goto();

        // and sees the two notifications waiting
        notification = await user0.page.getByTestId('call-incoming');
        await expect(notification).toBeVisible();
        await expect(notification).toContainText(`${usernames[1]} is inviting you to a call`);

        condensedNotification = await user0.page.getByTestId('call-incoming-condensed');
        await expect(condensedNotification).toBeVisible();
        await expect(await condensedNotification.screenshot()).toMatchSnapshot('call-incoming-condensed-notification-gm.png');
        await expect(condensedNotification).toContainText(`Call from ${usernames[2]} with ${usernames[1]}`);

        await user1.leaveCall();
        await user2.leaveCall();
    });

    test('dismiss works across clients and is recorded (reloading and new client)', async ({page}) => {
        const user1 = await startDMWith(userStorages[1], usernames[0]);
        await user1.startCall();

        const user2 = await openGM(userStorages[2], usernames[2]);
        await user2.startCall();

        let notification = await page.getByTestId('call-incoming');
        await expect(notification).toBeVisible();

        let condensedNotification = await page.getByTestId('call-incoming-condensed');
        await expect(condensedNotification).toBeVisible();

        // user opens a new client
        const user0 = await newUserPage(userStorages[0]);
        await user0.goto();

        // and sees the two notifications waiting
        notification = await user0.page.getByTestId('call-incoming');
        await expect(notification).toBeVisible();
        await expect(notification).toContainText(`${usernames[1]} is inviting you to a call`);

        condensedNotification = await user0.page.getByTestId('call-incoming-condensed');
        await expect(condensedNotification).toBeVisible();
        await expect(await condensedNotification.screenshot()).toMatchSnapshot('call-incoming-condensed-notification-gm.png');
        await expect(condensedNotification).toContainText(`Call from ${usernames[2]} with ${usernames[1]}`);

        // user dismisses first notification in first client
        await page.getByTestId('call-incoming-dismiss').click();

        // only one notification remains, the gm one
        condensedNotification = await page.getByTestId('call-incoming-condensed');
        await expect(condensedNotification).not.toBeVisible();
        notification = await page.getByTestId('call-incoming');
        await expect(notification).toBeVisible();
        await expect(notification).toContainText(`${usernames[2]} is inviting you to a call with ${usernames[1]}`);

        // same for second client
        condensedNotification = await user0.page.getByTestId('call-incoming-condensed');
        await expect(condensedNotification).not.toBeVisible();
        notification = await user0.page.getByTestId('call-incoming');
        await expect(notification).toBeVisible();
        await expect(notification).toContainText(`${usernames[2]} is inviting you to a call with ${usernames[1]}`);

        // second client reloads, sees the same
        await user0.goto();
        condensedNotification = await user0.page.getByTestId('call-incoming-condensed');
        await expect(condensedNotification).not.toBeVisible();
        notification = await user0.page.getByTestId('call-incoming');
        await expect(notification).toBeVisible();
        await expect(notification).toContainText(`${usernames[2]} is inviting you to a call with ${usernames[1]}`);

        await user1.leaveCall();
        await user2.leaveCall();
    });

    test('do not ring twice for same call, lhs -> widget', async ({page}) => {
        // Notification appears in LHS, then user starts a call, the notification moves to above the widget (no sound for second appearance)
        await page.evaluate(() => {
            window.e2eNotificationsSoundedAt = [];
            window.e2eRingLength = 500;
        });

        const user1 = await startDMWith(userStorages[1], usernames[0]);
        await user1.startCall();

        // received notification
        let notification = await page.getByTestId('call-incoming');
        await expect(notification).toBeVisible();
        await expect(notification).toContainText(`${usernames[1]} is inviting you to a call`);
        let notificationsSoundedAt = await page.evaluate(() => {
            return window.e2eNotificationsSoundedAt || [];
        });
        await expect(notificationsSoundedAt.length).toEqual(1);

        // Now start a call
        const devPage = new PlaywrightDevPage(page);
        await devPage.startCall();

        // Original LHS notification should be gone
        await expect(notification).not.toBeVisible();

        // New widget notification
        notification = await page.getByTestId('call-incoming-condensed-widget');
        await expect(notification).toBeVisible();
        await expect(notification).toContainText(`Call from ${usernames[1]}`);

        // And should not have heard a new sound
        notificationsSoundedAt = await page.evaluate(() => {
            return window.e2eNotificationsSoundedAt || [];
        });
        await expect(notificationsSoundedAt.length).toEqual(1);

        await devPage.leaveCall();
        await user1.leaveCall();
    });

    test('do not ring twice for same call, widget -> lhs', async ({page}) => {
        // User is in a call, notification appears above widget (no sound), then user ends call, the notification moves to LHS (no sound for second appearance)
        await page.evaluate(() => {
            window.e2eNotificationsSoundedAt = [];
            window.e2eRingLength = 500;
        });

        const devPage = new PlaywrightDevPage(page);
        await devPage.startCall();

        const user1 = await startDMWith(userStorages[1], usernames[0]);
        await user1.startCall();

        // received notification above widget, not in lhs
        let notification = await page.getByTestId('call-incoming');
        await expect(notification).not.toBeVisible();
        notification = await page.getByTestId('call-incoming-condensed-widget');
        await expect(notification).toContainText(`Call from ${usernames[1]}`);

        // No sound
        await devPage.expectNotifications(0, 0, 0, 0);

        // Exit current call
        await devPage.leaveCall();

        // Old widget notification gone, new LHS notification
        await expect(notification).not.toBeVisible();
        notification = await page.getByTestId('call-incoming');
        await expect(notification).toBeVisible();
        await expect(notification).toContainText(`${usernames[1]} is inviting you to a call`);

        // Should not have heard a second notification ring
        await devPage.expectNotifications(0, 0, 0, 0);

        await user1.leaveCall();
    });

    test('stop ringing immediately when joining any call', async ({page}) => {
        await page.evaluate(() => {
            window.e2eNotificationsSoundedAt = [];
            window.e2eNotificationsSoundStoppedAt = [];
        });

        const user1 = await startDMWith(userStorages[1], usernames[0]);
        await user1.startCall();

        const devPage = new PlaywrightDevPage(page);
        await devPage.expectNotifications(0, 0, 1, 0);

        await devPage.startCall();
        await devPage.expectNotifications(0, 0, 1, 1);

        await user1.leaveCall();
        await devPage.leaveCall();
    });

    test('user is DND: no ringing, no desktop notification', async ({page, request}) => {
        await page.evaluate(() => {
            window.e2eDesktopNotificationsRejected = [];
            window.e2eDesktopNotificationsSent = [];
            window.e2eNotificationsSoundedAt = [];
        });

        await apiPutStatus(request, 'dnd');
        await page.reload();

        // we need to be 'hidden' so that our desktop notifications are sent
        const devPage = new PlaywrightDevPage(page);
        await devPage.hideDocument(true);

        const user1 = await startDMWith(userStorages[1], usernames[0]);
        await user1.startCall();
        const notification = await page.getByTestId('call-incoming');
        await expect(notification).toBeVisible();
        await expect(notification).toContainText(`${usernames[1]} is inviting you to a call`);
        await devPage.expectNotifications(0, 0, 0, 0);

        await user1.leaveCall();
    });

    test('user is OOO: no ringing, no desktop notification', async ({page, request}) => {
        // set automatic replies setting (ooo) to true
        const adminContext = (await newUserPage(adminState.storageStatePath)).page.request;
        let resp = await adminContext.put(`${baseURL}/api/v4/config/patch`, {
            headers: {'X-Requested-With': 'XMLHttpRequest'},
            data: {
                TeamSettings: {
                    ExperimentalEnableAutomaticReplies: true,
                },
            },
        });
        await expect(resp.status()).toEqual(200);

        await apiPatchNotifyProps(request, {
            desktop: 'mentions',
            calls_desktop_sound: 'true',
            auto_responder_active: 'true',
            auto_responder_message: 'ooo',
        });
        await page.reload();
        const devPage = new PlaywrightDevPage(page);
        await page.evaluate(() => {
            window.e2eDesktopNotificationsRejected = [];
            window.e2eDesktopNotificationsSent = [];
            window.e2eNotificationsSoundedAt = [];
        });

        // get rid of the ooo dialog
        const modal = await page.locator('#confirmModal');
        if (await modal.isVisible()) {
            await modal.locator('#cancelModalButton').click();
        }

        // we need to be 'hidden' so that our desktop notifications are sent
        await devPage.hideDocument(true);

        const user1 = await startDMWith(userStorages[1], usernames[0]);
        await user1.startCall();

        const notification = await page.getByTestId('call-incoming');
        await expect(notification).toBeVisible();
        await expect(notification).toContainText(`${usernames[1]} is inviting you to a call`);
        await devPage.expectNotifications(0, 0, 0, 0);

        // cleanup
        await user1.leaveCall();
        resp = await adminContext.put(`${baseURL}/api/v4/config/patch`, {
            headers: {'X-Requested-With': 'XMLHttpRequest'},
            data: {
                TeamSettings: {
                    ExperimentalEnableAutomaticReplies: false,
                },
            },
        });
        await expect(resp.status()).toEqual(200);
    });

    test('gm channel pref sound off: ringing sound yes, desktop notification yes', async ({page, request}) => {
        const devPage = new PlaywrightDevPage(page);
        const channel = await devPage.goToGM(usernames[0]);
        await apiChannelNotifyProps(request, channel.id, allUserIDsInTest[0], {desktop_sound: 'off'});
        await devPage.goto();
        await page.evaluate(() => {
            window.e2eDesktopNotificationsRejected = [];
            window.e2eDesktopNotificationsSent = [];
            window.e2eNotificationsSoundedAt = [];
        });

        // we need to be 'hidden' so that our desktop notifications are sent
        await devPage.hideDocument(true);

        const user1 = await openGM(userStorages[1], usernames[1]);
        await user1.startCall();

        const notification = await page.getByTestId('call-incoming');
        await expect(notification).toBeVisible();
        await expect(notification).toContainText(`${usernames[1]} is inviting you to a call with ${usernames[2]}`);

        const notificationsRejected = await page.evaluate(() => {
            return window.e2eDesktopNotificationsRejected || [];
        });
        const desktopNotificationsSent = await page.evaluate(() => {
            return window.e2eDesktopNotificationsSent || [];
        });
        const notificationsSoundedAt = await page.evaluate(() => {
            return window.e2eNotificationsSoundedAt || [];
        });
        await expect(notificationsRejected.length).toEqual(1);
        await expect(notificationsRejected[0].body).toEqual(`@${usernames[1]}: ${usernames[1]} started a call`);
        await expect(desktopNotificationsSent.length).toEqual(1);
        await expect(desktopNotificationsSent[0]).toEqual(`${usernames[1]} is inviting you to a call`);
        await expect(notificationsSoundedAt.length).toEqual(1);

        await user1.leaveCall();
    });

    test('gm channel pref desktop notification never: ringing sound yes, desktop notification no', async ({
        page,
        request,
    }) => {
        const devPage = new PlaywrightDevPage(page);
        const channel = await devPage.goToGM(usernames[0]);
        await apiChannelNotifyProps(request, channel.id, allUserIDsInTest[0], {desktop: 'none'});
        await devPage.goto();
        await page.evaluate(() => {
            window.e2eNotificationsSoundedAt = [];
            window.e2eDesktopNotificationsRejected = [];
            window.e2eDesktopNotificationsSent = [];
        });

        //await devPage.hideDocument(true);
        const user1 = await openGM(userStorages[1], usernames[1]);
        await user1.startCall();

        const notification = await page.getByTestId('call-incoming');
        await expect(notification).toBeVisible();
        await expect(notification).toContainText(`${usernames[1]} is inviting you to a call with ${usernames[2]}`);
        await devPage.expectNotifications(0, 0, 1, 0);

        await user1.leaveCall();
    });

    test('gm channel pref mute: ringing sound no, desktop notification no', async ({page, request}) => {
        const devPage = new PlaywrightDevPage(page);
        const channel = await devPage.goToGM(usernames[0]);
        await apiChannelNotifyProps(request, channel.id, allUserIDsInTest[0], {mark_unread: 'mention'});
        await devPage.goto();
        await page.evaluate(() => {
            window.e2eDesktopNotificationsRejected = [];
            window.e2eNotificationsSoundedAt = [];
            window.e2eDesktopNotificationsSent = [];
        });

        await devPage.hideDocument(true);

        const user1 = await openGM(userStorages[1], usernames[1]);
        await user1.startCall();

        const notification = await page.getByTestId('call-incoming');
        await expect(notification).toBeVisible();
        await expect(notification).toContainText(`${usernames[1]} is inviting you to a call with ${usernames[2]}`);
        await devPage.expectNotifications(0, 0, 0, 0);

        await user1.leaveCall();
    });

    test('expanded view notification: change channel, dismiss, join new call', async ({page, context}) => {
        const userIdx = getUserIdxForTest();
        const devPage = new PlaywrightDevPage(page);
        await devPage.goto();
        await devPage.startCall();

        const [popOut, _] = await Promise.all([
            context.waitForEvent('page'),
            page.click('#calls-widget-expand-button'),
        ]);

        let user1 = await startDMWith(userStorages[1], usernames[0]);
        await user1.startCall();

        // Expect to see the notification
        let condensedNotification = popOut.getByTestId('call-incoming-condensed');
        await expect(condensedNotification).toBeVisible();

        // Assert we're not in the DM channel yet
        await expect(page.locator('#channelHeaderTitle')).toContainText(getChannelNamesForTest()[0]);

        // Expect to go to DM when clicking on notification body.
        await condensedNotification.click();
        await expect(page.url()).not.toEqual(getChannelURL(getChannelNamesForTest()[0]));
        await expect(page.locator('#channelHeaderTitle')).toContainText(usernames[1]);

        // return
        await page.locator(`#sidebarItem_calls${userIdx}`).click();
        await expect(page.locator('#channelHeaderTitle')).toContainText(getChannelNamesForTest()[0]);

        // Expect to see join call modal when clicking notification join.
        await popOut.getByTestId('call-incoming-condensed-join').click();
        await expect(popOut.locator('#calls-switch-call-modal')).toBeVisible();
        await expect(popOut.locator('#calls-switch-call-modal')).toContainText('You\'re already in a call');
        await popOut.getByRole('button', {name: 'Cancel'}).click();

        // Expect to dismiss notification.
        await popOut.getByTestId('call-incoming-condensed-dismiss').click();
        await expect(popOut.locator('#calls-switch-call-modal')).toBeHidden();
        await expect(popOut.getByTestId('call-incoming-condensed')).toBeHidden();

        // Start a new call to get a new notification.
        await user1.leaveCall();
        user1 = await startDMWith(userStorages[1], usernames[0]);
        await user1.startCall();

        // Expect to see the notification
        condensedNotification = popOut.getByTestId('call-incoming-condensed');
        await expect(condensedNotification).toBeVisible();

        // Assert we're not in the DM call yet
        await expect(page.locator('.calls-channel-link')).toContainText(getChannelNamesForTest()[0]);

        // Join the new call
        await popOut.getByTestId('call-incoming-condensed-join').click();
        await expect(popOut.locator('#calls-switch-call-modal')).toBeVisible();
        await expect(popOut.locator('#calls-switch-call-modal')).toContainText('You\'re already in a call');
        await popOut.getByRole('button', {name: 'Leave and join new call'}).click();
        await expect(popOut.isClosed()).toBeTruthy();

        // Expect to be in the new DM call
        await expect(page.locator('.calls-channel-link')).toContainText(usernames[1]);

        await user1.leaveCall();
        await devPage.leaveCall();
    });

    test('ringing stops on last leave, and /call end', async ({page}) => {
        await page.evaluate(() => {
            window.e2eDesktopNotificationsRejected = [];
            window.e2eDesktopNotificationsSent = [];
            window.e2eNotificationsSoundedAt = [];
            window.e2eNotificationsSoundStoppedAt = [];
        });

        const devPage = new PlaywrightDevPage(page);

        const user1 = await startDMWith(userStorages[1], usernames[0]);
        await user1.startCall();

        let notification = page.getByTestId('call-incoming');
        await expect(notification).toBeVisible();
        await expect(notification).toContainText(`${usernames[1]} is inviting you to a call`);

        // Ringing
        await devPage.expectNotifications(1, 0, 1, 0);

        await user1.leaveCall();

        notification = page.getByTestId('call-incoming');
        await expect(notification).toBeHidden();

        // Stopped ringing
        await devPage.expectNotifications(1, 0, 1, 1);

        await user1.startCall();

        notification = page.getByTestId('call-incoming');
        await expect(notification).toBeVisible();
        await expect(notification).toContainText(`${usernames[1]} is inviting you to a call`);

        // Ringing
        await devPage.expectNotifications(2, 0, 2, 1);

        await user1.slashCallEnd();
        notification = page.getByTestId('call-incoming');
        await expect(notification).toBeHidden();

        // Stopped ringing
        await devPage.expectNotifications(2, 0, 2, 2);
    });
});
