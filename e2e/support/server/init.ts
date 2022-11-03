// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import path from 'path';

import {PreferenceType} from '@mattermost/types/lib/preferences';

import {userState} from '../../constants';

import {getOnPremServerConfig} from './default_config';
import {createRandomTeam} from './team';
import {createRandomUser} from './user';

import {makeClient} from '.';

export async function initSetup({
    userPrefix = 'user',
    teamPrefix = {name: 'team', displayName: 'Team'},
    withDefaultProfileImage = false,
} = {}) {
    try {
        const {adminClient, adminUser} = await getAdminClient();

        const adminConfig = await adminClient.updateConfig(getOnPremServerConfig());

        const team = await adminClient.createTeam(createRandomTeam(teamPrefix.name, teamPrefix.displayName));

        const randomUser = createRandomUser(userPrefix);
        const user = await adminClient.createUser(randomUser);
        user.password = randomUser.password;

        await adminClient.addToTeam(team.id, user.id);

        const {client: userClient} = await makeClient(user);

        if (withDefaultProfileImage) {
            const fullPath = path.join(path.resolve(__dirname), '../', 'fixtures/mattermost-icon_128x128.png');
            await userClient.uploadProfileImageX(user.id, fullPath);
        }

        const preferences: PreferenceType[] = [
            {user_id: user.id, category: 'tutorial_step', name: user.id, value: '999'},
            {user_id: user.id, category: 'recommended_next_steps', name: 'hide', value: 'true'},
            {user_id: user.id, category: 'recommended_next_steps', name: 'skip', value: 'true'},
            {user_id: user.id, category: 'insights', name: 'insights_tutorial_state', value: '{"insights_modal_viewed":true}'},
        ];
        await userClient.savePreferences(user.id, preferences);

        return {
            adminClient,
            adminUser,
            adminConfig,
            user,
            userClient,
            team,
            offTopicUrl: getUrl(team.name, 'off-topic'),
            townSquareUrl: getUrl(team.name, 'town-square'),
        };
    } catch (err) {
        // log an error for debugging
        console.log(err);
        return {err};
    }
}

export async function makeTestUser({adminClient, team, userPrefix = 'user', withDefaultProfileImage = false}) {
    const randomUser = createRandomUser(userPrefix);
    const user = await adminClient.createUser(randomUser);
    user.password = randomUser.password;

    await adminClient.addToTeam(team.id, user.id);

    const {client: userClient} = await makeClient(user);

    if (withDefaultProfileImage) {
        const fullPath = path.join(path.resolve(__dirname), '../', 'fixtures/mattermost-icon_128x128.png');
        await userClient.uploadProfileImageX(user.id, fullPath);
    }

    const preferences: PreferenceType[] = [
        {user_id: user.id, category: 'tutorial_step', name: user.id, value: '999'},
        {user_id: user.id, category: 'recommended_next_steps', name: 'hide', value: 'true'},
        {user_id: user.id, category: 'recommended_next_steps', name: 'skip', value: 'true'},
        {user_id: user.id, category: 'insights', name: 'insights_tutorial_state', value: '{"insights_modal_viewed":true}'},
    ];
    await userClient.savePreferences(user.id, preferences);
    return {user, userClient};
}

export async function getAdminClient() {
    const {
        client: adminClient,
        user: adminUser,
        err,
    } = await makeClient({
        username: userState.admin.username,
        password: userState.admin.password,
    });

    return {adminClient, adminUser, err};
}

function getUrl(teamName, channelName) {
    return `/${teamName}/channels/${channelName}`;
}
