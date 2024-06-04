/* eslint-disable no-await-in-loop */

import {expect, FullConfig, request} from '@playwright/test';
import {readFile} from 'fs/promises';

import {adminState, baseURL, channelPrefix, defaultTeam, pluginID, userPassword, userPrefix} from './constants';

async function globalSetup(config: FullConfig) {
    const numUsers = config.workers * 3;
    const numChannels = config.workers * 3;
    const userIDs = [];

    const headers = {'X-Requested-With': 'XMLHttpRequest'};

    const adminContext = await request.newContext({
        baseURL,

        // prevents initial desktop app prompt from showing
        storageState: {
            cookies: [{
                name: '',
                value: '',
                domain: '',
                path: '',
                expires: 0,
                httpOnly: false,
                secure: false,
                sameSite: 'None',
            }],
            origins: [{
                origin: baseURL,
                localStorage: [{
                    name: '__landingPageSeen__',
                    value: 'true',
                }],
            }],
        },
    });

    await adminContext.post('/api/v4/users/login', {
        data: {
            login_id: adminState.username,
            password: adminState.password,
        },
        headers,
    });
    await adminContext.storageState({path: adminState.storageStatePath});

    // create and log users in.
    for (let i = 0; i < numUsers; i++) {
        const username = `${userPrefix}${i}`;
        await adminContext.post('api/v4/users', {
            data: {
                email: `${username}@example.com`,
                username,
                password: userPassword,
            },
            headers,
        });

        const requestContext = await request.newContext({
            baseURL,

            // prevents initial desktop app prompt from showing
            storageState: {
                cookies: [{
                    name: '',
                    value: '',
                    domain: '',
                    path: '',
                    expires: 0,
                    httpOnly: false,
                    secure: false,
                    sameSite: 'None',
                }],
                origins: [{
                    origin: baseURL,
                    localStorage: [{
                        name: '__landingPageSeen__',
                        value: 'true',
                    }],
                }],
            },
        });
        const resp = await requestContext.post('/api/v4/users/login', {
            data: {
                login_id: username,
                password: userPassword,
            },
            headers,
        });
        const user = await resp.json();
        userIDs.push(user.id);
        await requestContext.storageState({path: `${userPrefix}${i}StorageState.json`});
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

    const getPreferences = (userID: string) => [
        {user_id: userID, category: 'recommended_next_steps', name: 'hide', value: 'true'},
        {user_id: userID, category: 'insights', name: 'insights_tutorial_state', value: '{"insights_modal_viewed":true}'},
        {user_id: userID, category: 'drafts', name: 'drafts_tour_tip_showed', value: '{"drafts_tour_tip_showed":true}'},
        {user_id: userID, category: 'crt_thread_pane_step', name: userID, value: '999'},
        {user_id: userID, category: 'system_notice', name: 'GMasDM', value: 'true'},
    ];

    // set admin preferences
    resp = await adminContext.get('/api/v4/users/me');
    const adminUser = await resp.json();
    await adminContext.put(`/api/v4/users/${adminUser.id}/preferences`, {
        data: getPreferences(adminUser.id),
        headers,
    });

    // add users to team.
    for (let i = 0; i < numUsers; i++) {
        const username = `${userPrefix}${i}`;
        resp = await adminContext.get(`/api/v4/users/username/${username}`);
        const user = await resp.json();
        await adminContext.post(`/api/v4/teams/${team.id}/members`, {
            data: {
                team_id: team.id,
                user_id: user.id,
            },
            headers,
        });

        // disable various onboarding flows
        await adminContext.put(`/api/v4/users/${user.id}/preferences`, {
            data: getPreferences(user.id),
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
    for (let i = 0; i < numChannels; i++) {
        const name = `${channelPrefix}${i}`;
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
        for (let i = 0; i < numUsers; i++) {
            const username = `${userPrefix}${i}`;
            resp = await adminContext.post('/api/v4/users/usernames', {data: [username], headers});
            const users = await resp.json();
            await adminContext.post(`/api/v4/channels/${channel.id}/members`, {
                data: {
                    user_id: users[0].id,
                },
                headers,
            });
        }

        await adminContext.post(`/plugins/${pluginID}/${channel.id}`, {
            data: {
                enabled: true,
            },
            headers,
        });
    }

    // create GM channels
    for (let i = 0; i < config.workers; i++) {
        resp = await adminContext.post('/api/v4/channels/group', {
            headers,
            data: [userIDs[i * 3], userIDs[(i * 3) + 1], userIDs[(i * 3) + 2]],
        });
        await expect(resp.status()).toEqual(201);
    }

    await adminContext.post(`/api/v4/plugins/${pluginID}/enable`, {
        headers,
    });

    // enable calls for all channels, enable ringing
    const serverConfig = await (await adminContext.get('/api/v4/config')).json();
    serverConfig.PluginSettings.Plugins = {
        ...serverConfig.PluginSettings.Plugins,
        [`${pluginID}`]: {
            ...serverConfig.PluginSettings.Plugins[pluginID],
            defaultenabled: true,
            enableringing: true,
        },
    };
    await adminContext.put('/api/v4/config', {
        data: serverConfig,
        headers,
    });

    await adminContext.dispose();
}

export default globalSetup;
