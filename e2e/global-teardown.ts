import * as fs from 'fs/promises';

import {FullConfig} from '@playwright/test';

import {adminState, userPrefix} from './constants';

async function globalTeardown(config: FullConfig) {
    const numUsers = config.workers * 2;

    await fs.unlink(adminState.storageStatePath);

    for (let i = 0; i < numUsers; i++) {
        await fs.unlink(`${userPrefix}${i}StorageState.json`);
    }
}

export default globalTeardown;
