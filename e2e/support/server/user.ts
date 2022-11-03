// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {UserProfile} from '@mattermost/types/lib/users';

import {userState} from '../../constants';

import {getRandomId} from '../utils';

export function createRandomUser(prefix = 'user') {
    const randomId = getRandomId();

    const user = {
        email: `${prefix}${randomId}@sample.mattermost.com`,
        username: `${prefix}${randomId}`,
        password: 'passwd',
        first_name: `First${randomId}`,
        last_name: `Last${randomId}`,
        nickname: `Nickname${randomId}`,
    };

    return user as UserProfile;
}

export function getDefaultAdminUser() {
    const admin = {
        username: userState.admin.username,
        password: userState.admin.password,
        first_name: 'Kenneth',
        last_name: 'Moreno',
        email: userState.admin.email,
    };

    return admin as UserProfile;
}
