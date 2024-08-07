/* eslint-disable no-process-env */

import {chromium, Page, test} from '@playwright/test';
import * as fs from 'fs';

import {baseURL, channelPrefix, defaultTeam, userPrefix} from './constants';
import PlaywrightDevPage from './page';

export const headers = {'X-Requested-With': 'XMLHttpRequest'};

export function getChannelNamesForTest() {
    let idx = 0;
    if (process.env.TEST_PARALLEL_INDEX) {
        idx = parseInt(String(process.env.TEST_PARALLEL_INDEX), 10) * 3;
    }
    return [`${channelPrefix}${idx}`, `${channelPrefix}${idx + 1}`, `${channelPrefix}${idx + 2}`];
}

export function getUserIdxForTest() {
    if (process.env.TEST_PARALLEL_INDEX) {
        return parseInt(String(process.env.TEST_PARALLEL_INDEX), 10) * 3;
    }
    return 0;
}

export function getUsernamesForTest() {
    const idx = getUserIdxForTest();
    return [`${userPrefix}${idx}`, `${userPrefix}${idx + 1}`, `${userPrefix}${idx + 2}`];
}

export function getUserStoragesForTest() {
    const names = getUsernamesForTest();
    return [`${names[0]}StorageState.json`, `${names[1]}StorageState.json`, `${names[2]}StorageState.json`];
}

export function getUserIDsForTest() {
    const storageStates = getUserStoragesForTest();
    return storageStates.map((ss) => {
        const data = JSON.parse(fs.readFileSync(ss, 'utf-8'));
        const idx = data.cookies.findIndex((c: { name: string; }) => c.name === 'MMUSERID');
        return data.cookies[idx].value;
    });
}

export async function newUserPage(userState: string) {
    const browser = await chromium.launch();
    const context = await browser.newContext({storageState: userState});
    return new PlaywrightDevPage(await context.newPage());
}

export async function startCall(userState: string) {
    const userPage = await newUserPage(userState);
    await userPage.goto();
    await userPage.startCall();
    return userPage;
}

export async function startCallAndPopout(userState: string) {
    const userPage = await newUserPage(userState);
    await userPage.goto();
    await userPage.startCall();

    const [popOut, _] = await Promise.all([
        userPage.page.context().waitForEvent('page'),
        userPage.page.click('#calls-widget-expand-button'),
    ]);
    const userPopout = new PlaywrightDevPage(popOut);

    return [userPage, userPopout];
}

export async function startDMWith(userState: string, targetUserName: string) {
    const userPage = await newUserPage(userState);
    await userPage.gotoDM(targetUserName);
    return userPage;
}

export async function openGM(userState: string, userName: string) {
    const userPage = await newUserPage(userState);
    await userPage.goToGM(userName);
    return userPage;
}

export async function joinCall(userState: string) {
    const userPage = await newUserPage(userState);
    await userPage.goto();
    await userPage.joinCall();
    return userPage;
}

export async function joinCallAndPopout(userState: string) {
    const userPage = await newUserPage(userState);
    await userPage.goto();
    await userPage.joinCall();

    const [popOut, _] = await Promise.all([
        userPage.page.context().waitForEvent('page'),
        userPage.page.click('#calls-widget-expand-button'),
    ]);
    const userPopout = new PlaywrightDevPage(popOut);

    return [userPage, userPopout];
}

export function getChannelURL(channelName: string) {
    return `${baseURL}/${defaultTeam}/channels/${channelName}`;
}

export async function resizeAndScreenshot(page: Page, testID: string) {
    const contentSize = await page.evaluate((id: string) => {
        const content = document.querySelector(`[data-testid="${id}"`)!;
        return {
            width: content.scrollWidth,
            height: content.scrollHeight,
        };
    }, testID);

    const originalSize = page.viewportSize()!;

    const viewportSize = {
        ...originalSize,
    };

    if (contentSize.width > viewportSize.width - 200) {
        viewportSize.width = contentSize.width + 200;
    }

    if (contentSize.height > viewportSize.height - 200) {
        viewportSize.height = contentSize.height + 200;
    }

    await page.setViewportSize(viewportSize);

    const el = page.getByTestId(testID);
    await el.scrollIntoViewIfNeeded();

    const screenshot = await el.screenshot();

    await page.setViewportSize(originalSize);

    return screenshot;
}

export async function wait(ms: number) {
    return new Promise((res) => {
        setTimeout(() => res(true), ms);
    });
}

export async function acquireLock(lockID: string) {
    // Acquire lock
    for (;;) {
        try {
            fs.mkdirSync(`/tmp/${lockID}`);
        } catch (err) {
            // eslint-disable-next-line no-console
            console.log(test.info().title, 'waiting for lock');
            // eslint-disable-next-line no-await-in-loop
            await wait(1000);
            continue;
        }
        // eslint-disable-next-line no-console
        console.log(test.info().title, 'lock acquired');
        return;
    }

    throw new Error('timed out acquiring lock');
}

export function releaseLock(lockID: string) {
    // Release lock
    fs.rmdirSync(`/tmp/${lockID}`);

    // eslint-disable-next-line no-console
    console.log(test.info().title, 'lock released');
}
