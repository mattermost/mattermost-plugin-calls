// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, request} from '@playwright/test';

import {adminState, baseURL, pluginID} from './constants';
import {getHTTPHeaders} from './utils';

type CallsConfig = {
    enabletranscriptions?: boolean;
    enablelivecaptions?: boolean;
    enableav1?: boolean;
};

export const apiPatchConfig = async (cfg: CallsConfig) => {
    const adminContext = await request.newContext({
        baseURL,
        storageState: adminState.storageStatePath,
    });
    const headers = await getHTTPHeaders(adminContext);
    const serverConfig = await (await adminContext.get(`${baseURL}/api/v4/config`, {headers})).json();

    serverConfig.PluginSettings.Plugins = {
        ...serverConfig.PluginSettings.Plugins,
        [`${pluginID}`]: {
            ...serverConfig.PluginSettings.Plugins[pluginID],
            ...cfg,
        },
    };

    const resp = await adminContext.put(`${baseURL}/api/v4/config`, {
        headers,
        data: serverConfig,
    });

    await expect(resp.status()).toEqual(200);
};

export const apiSetEnableTranscriptions = async (enabled: boolean) => {
    return apiPatchConfig({
        enabletranscriptions: enabled,
    });
};

export const apiSetEnableLiveCaptions = async (enabled: boolean) => {
    return apiPatchConfig({
        enablelivecaptions: enabled,
    });
};

export const apiSetEnableAV1 = async (enabled: boolean) => {
    return apiPatchConfig({
        enableav1: enabled,
    });
};
