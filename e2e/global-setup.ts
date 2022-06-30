import {readFile} from 'fs/promises';

import {request, FullConfig} from '@playwright/test';

import plugin from '../plugin.json';

import {userState, baseURL, defaultTeam} from './constants';

async function globalSetup(config: FullConfig) {
    const headers = {'X-Requested-With': 'XMLHttpRequest'};

    const adminContext = await request.newContext({
        baseURL,
    });
    await adminContext.post('/api/v4/users/login', {
        data: {
            login_id: userState.admin.username,
            password: userState.admin.password,
        },
        headers,
    });
    await adminContext.storageState({path: userState.admin.storageStatePath});

    // create and log users in.
    for (const user of userState.users) {
        await adminContext.post('api/v4/users', {
            data: {
                email: `${user.username}@example.com`,
                username: user.username,
                password: user.password,
            },
            headers,
        });
        const requestContext = await request.newContext({
            baseURL,
        });
        await requestContext.post('/api/v4/users/login', {
            data: {
                login_id: user.username,
                password: user.password,
            },
            headers,
        });
        await requestContext.storageState({path: user.storageStatePath});
        await requestContext.dispose();
    }

    let resp = await adminContext.get(`/api/v4/teams/name/${defaultTeam}`);
    if (resp.status() >= 400) {
        // create team if missing.
        resp = await adminContext.post('/api/v4/teams', {
            data: {
                name: defaultTeam,
                display_name: defaultTeam,
                type: 'O',
            },
            headers,
        });
    }

    const team = await resp.json();

    // add users to team.
    for (const userInfo of userState.users) {
        resp = await adminContext.get(`/api/v4/users/username/${userInfo.username}`);
        const user = await resp.json();
        await adminContext.post(`/api/v4/teams/${team.id}/members`, {
            data: {
                team_id: team.id,
                user_id: user.id,
            },
            headers,
        });
        await adminContext.put(`/api/v4/users/${user.id}/preferences`, {
            data: [{user_id: user.id, category: 'recommended_next_steps', name: 'skip', value: 'true'}],
            headers,
        });

        await adminContext.post(`/api/v4/users/${user.id}/image`, {
            multipart: {
                image: {
                    name: 'profile.png',
                    mimeType: 'image/png',
                    buffer: await readFile('./assets/profile.png'),
                },
            },
            headers,
        });
    }

    const channels = [];

    // create some channels.
    for (let i = 0; i < config.workers * 2; i++) {
        const name = `calls${i}`;
        channels.push(name);
        await adminContext.post('/api/v4/channels', {
            data: {
                team_id: team.id,
                name,
                display_name: name,
                type: 'O',
            },
            headers,
        });
    }

    // add users to channels.
    for (const channelName of channels) {
        resp = await adminContext.get(`/api/v4/teams/${team.id}/channels/name/${channelName}`);
        const channel = await resp.json();
        for (const userInfo of userState.users) {
            resp = await adminContext.post('/api/v4/users/usernames', {data: [userInfo.username], headers});
            const users = await resp.json();
            await adminContext.post(`/api/v4/channels/${channel.id}/members`, {
                data: {
                    user_id: users[0].id,
                },
                headers,
            });
        }
    }

    // enable calls.
    for (const channelName of channels) {
        resp = await adminContext.get(`/api/v4/teams/${team.id}/channels/name/${channelName}`);
        const channel = await resp.json();
        await adminContext.post(`/plugins/${plugin.id}/${channel.id}`, {
            data: {
                enabled: true,
            },
            headers,
        });
    }

    // enable calls in DMs.
    const userContext = await request.newContext({
        baseURL,
    });
    await userContext.post('/api/v4/users/login', {
        data: {
            login_id: userState.users[0].username,
            password: userState.users[0].password,
        },
        headers,
    });
    for (const userInfo of userState.users.slice(1)) {
        resp = await userContext.post('/api/v4/users/usernames', {data: [userState.users[0].username, userInfo.username], headers});
        const users = await resp.json();
        resp = await userContext.post('/api/v4/channels/direct', {data: [users[0].id, users[1].id], headers});
        const channel = await resp.json();
        await userContext.post(`/plugins/${plugin.id}/${channel.id}`, {
            data: {
                enabled: true,
            },
            headers,
        });
    }

    await adminContext.dispose();
}

export default globalSetup;
