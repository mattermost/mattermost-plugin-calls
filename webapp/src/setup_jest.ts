// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import '@testing-library/jest-dom';

import {TextDecoder, TextEncoder} from 'util';

global.TextEncoder = TextEncoder;

// @ts-ignore
global.TextDecoder = TextDecoder;

// src/index.tsx registers the plugin as soon as it is imported.
window.registerPlugin = jest.fn();
