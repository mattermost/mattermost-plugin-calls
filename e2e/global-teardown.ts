// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/* eslint-disable no-await-in-loop */
import {FullConfig} from '@playwright/test';
import * as fs from 'fs/promises';

import {adminState, userPrefix} from './constants';

async function globalTeardown(config: FullConfig) {
    const numUsers = config.workers * 3;

    await fs.unlink(adminState.storageStatePath);

    for (let i = 0; i < numUsers; i++) {
        await fs.unlink(`${userPrefix}${i}StorageState.json`);
    }
}

export default globalTeardown;
