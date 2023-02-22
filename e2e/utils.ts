import {chromium} from '@playwright/test';

import PlaywrightDevPage from './page';

export function getChannelNameForTest() {
    const idx = parseInt(process.env.TEST_PARALLEL_INDEX as string, 10) * 2;
    return `calls${idx}`;
}

export async function startCall(userState: string) {
    const browser = await chromium.launch();
    const context = await browser.newContext({storageState: userState});
    const userPage = new PlaywrightDevPage(await context.newPage());
    await userPage.goto();
    await userPage.startCall();
    return userPage;
}

