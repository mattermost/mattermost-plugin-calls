import {chromium} from '@playwright/test';

import {userPrefix, channelPrefix} from './constants';
import PlaywrightDevPage from './page';

export function getChannelNamesForTest() {
    let idx = 0;
    if (process.env.TEST_PARALLEL_INDEX) {
        idx = parseInt(String(process.env.TEST_PARALLEL_INDEX), 10) * 2;
    }
    return [`${channelPrefix}${idx}`, `${channelPrefix}${idx + 1}`];
}

export function getUserIdxForTest() {
    if (process.env.TEST_PARALLEL_INDEX) {
        return parseInt(String(process.env.TEST_PARALLEL_INDEX), 10) * 2;
    }
    return 0;
}

export function getUsernamesForTest() {
    const idx = getUserIdxForTest();
    return [`${userPrefix}${idx}`, `${userPrefix}${idx + 1}`];
}

export function getUserStoragesForTest() {
    const names = getUsernamesForTest();
    return [`${names[0]}StorageState.json`, `${names[1]}StorageState.json`];
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

