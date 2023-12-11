// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

// @ts-ignore
const WebappUtils = window.opener ? window.opener.WebappUtils : window.WebappUtils;

export const navigateToURL = (urlPath: string) => {
    WebappUtils.browserHistory.push(urlPath);
};

export const handleFormattedTextClick = (e: React.MouseEvent<HTMLElement, MouseEvent>, url: string) => {
    e.preventDefault();
    navigateToURL(url);
};
