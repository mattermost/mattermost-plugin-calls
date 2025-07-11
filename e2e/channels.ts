// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect} from '@playwright/test';
import {APIRequestContext} from 'playwright-core';

import {baseURL, defaultTeam} from './constants';
import {getHTTPHeaders} from './utils';

export const apiCreateGroupChannel = async (request: APIRequestContext, userIDs: string[]) => {
    const resp = await request.post(`${baseURL}/api/v4/channels/group`, {
        headers: await getHTTPHeaders(request),
        data: userIDs,
    });
    expect(resp.status()).toEqual(201);
    return resp.json();
};

// Return first one found (that's all we need for now)
export const apiGetGroupChannel = async (request: APIRequestContext, userName: string) => {
    const resp = await request.post(`${baseURL}/api/v4/channels/group/search`, {
        headers: await getHTTPHeaders(request),
        data: {
            term: userName,
        },
    });
    expect(resp.status()).toEqual(200);
    const channels = await resp.json();

    // This may break if we need to create different GMs in the future. For now, simple and works.
    await expect(channels.length).toEqual(1);
    return channels[0];
};

export const apiChannelNotifyProps = async (request: APIRequestContext, channelID: string, userID: string, newProps: Record<string, string>) => {
    const resp = await request.put(`${baseURL}/api/v4/channels/${channelID}/members/${userID}/notify_props`, {
        headers: await getHTTPHeaders(request),
        data: {
            channel_id: channelID,
            user_id: userID,
            ...newProps,
        },
    });
    expect(resp.status()).toEqual(200);
    return resp.json();
};

export const apiGetChannelByName = async (request: APIRequestContext, channelName: string) => {
    let resp = await request.get(`${baseURL}/api/v4/teams/name/${defaultTeam}`);
    expect(resp.status()).toEqual(200);

    const teamID = (await resp.json()).id;
    expect(teamID).toBeDefined();

    resp = await request.get(`${baseURL}/api/v4/teams/${teamID}/channels/name/${channelName}`);
    expect(resp.status()).toEqual(200);

    return resp.json();
};
