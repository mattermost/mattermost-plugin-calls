import {chromium} from '@playwright/test';

import PlaywrightDevPage from './page';

export function getChannelNameForTest() {
    let idx = 0;
    if (process.env.TEST_PARALLEL_INDEX) {
        idx = parseInt(String(process.env.TEST_PARALLEL_INDEX), 10) * 2;
    }
    return `calls${idx}`;
}

export function getUserIdxForTest() {
    if (process.env.TEST_PARALLEL_INDEX) {
        return parseInt(String(process.env.TEST_PARALLEL_INDEX), 10) * 2;
    }
    return 0;
}

export async function startCall(userState: string) {
    const browser = await chromium.launch();
    const context = await browser.newContext({storageState: userState});
    const userPage = new PlaywrightDevPage(await context.newPage());
    await userPage.goto();
    await userPage.startCall();
    return userPage;
}

