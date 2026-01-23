// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {pluginId} from './manifest';

// This is a workaround to ensure that web worker files can be fetched correctly.
// @ts-ignore Cannot find name '__webpack_public_path__'
__webpack_public_path__ = `${window.basename || ''}/static/plugins/${pluginId}/`;

import('./index');

// This empty export forces this to be treated as a module by the TS compiler
export {};
