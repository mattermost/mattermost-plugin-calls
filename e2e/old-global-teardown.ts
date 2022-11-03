import * as fs from 'fs/promises';

import {FullConfig} from '@playwright/test';

import {userState} from './constants';

async function globalTeardown(config: FullConfig) {
    await fs.unlink(userState.admin.storageStatePath);
    for (const user of userState.users) {
        await fs.unlink(user.storageStatePath);
    }
}

export default globalTeardown;
