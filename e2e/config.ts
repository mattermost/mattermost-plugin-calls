import {expect} from '@playwright/test';
import {APIRequestContext} from 'playwright-core';

import {baseURL, adminState, pluginID} from './constants';
import {headers, newUserPage} from './utils';

type CallsConfig = {
    enabletranscriptions: boolean;
};

export const apiPatchConfig = async (cfg: CallsConfig) => {
    const adminContext = (await newUserPage(adminState.storageStatePath)).page.request;
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

export const apiEnableTranscriptions = async () => {
    return apiPatchConfig({
        enabletranscriptions: true,
    });
};

export const apiDisableTranscriptions = async () => {
    return apiPatchConfig({
        enabletranscriptions: false,
    });
};
