// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {STORAGE_CALLS_BLUR_BACKGROUND_KEY} from 'src/constants';

export type BgBlurData = {
    blurBackground: boolean;
    blurIntensity: number;
};

export function getBgBlurData() {
    let data = {
        blurBackground: false,
        blurIntensity: 0,
    };

    const bgBlurSettingsData = localStorage.getItem(STORAGE_CALLS_BLUR_BACKGROUND_KEY);
    if (bgBlurSettingsData) {
        data = JSON.parse(bgBlurSettingsData);
    }

    return data;
}

export function setBgBlurData(data: BgBlurData) {
    localStorage.setItem(STORAGE_CALLS_BLUR_BACKGROUND_KEY, JSON.stringify(data));
}
