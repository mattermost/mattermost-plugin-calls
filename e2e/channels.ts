import {expect} from '@playwright/test';
import {APIRequestContext} from 'playwright-core';

import {baseURL} from './constants';
import {headers} from './utils';

export const apiCreateGroupChannel = async (request: APIRequestContext, userIDs: string[]) => {
    const resp = await request.post(`${baseURL}/api/v4/channels/group`, {
        headers,
        data: userIDs,
    });
    expect(resp.status()).toEqual(201);
    return resp.json();
};

export const apiChannelNotifyProps = async (request: APIRequestContext, channelID: string, userID: string, newProps: Record<string, string>) => {
    const resp = await request.put(`${baseURL}/api/v4/channels/${channelID}/members/${userID}/notify_props`, {
        headers,
        data: {
            channel_id: channelID,
            user_id: userID,
            ...newProps,
        },
    });
    expect(resp.status()).toEqual(200);
    return resp.json();
};
