// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {getWebappUtils} from './utils';

// @ts-ignore
const WebappUtils = getWebappUtils();

export const navigateToURL = (urlPath: string) => {
    WebappUtils?.browserHistory.push(urlPath);
};

