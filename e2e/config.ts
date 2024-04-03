import {expect, request} from '@playwright/test';
import {APIRequestContext} from 'playwright-core';

import {adminState, baseURL, pluginID} from './constants';
import {headers, newUserPage} from './utils';

type CallsConfig = {
    enabletranscriptions?: boolean;
    enablelivecaptions?: boolean;
};

export const apiPatchConfig = async (cfg: CallsConfig) => {
    const adminContext = await request.newContext({
        baseURL,
        storageState: adminState.storageStatePath,
    });
    const serverConfig = await (await adminContext.get(`${baseURL}/api/v4/config`)).json();

    serverConfig.PluginSettings.Plugins = {
        ...serverConfig.PluginSettings.Plugins,
        [`${pluginID}`]: {
            ...serverConfig.PluginSettings.Plugins[pluginID],
            ...cfg,
        },
    };

    const resp = await adminContext.put(`${baseURL}/api/v4/config`, {
        headers: {'X-Requested-With': 'XMLHttpRequest'},
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
