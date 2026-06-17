// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import '@testing-library/jest-dom';

import React from 'react';
import {TextDecoder, TextEncoder} from 'util';

global.TextEncoder = TextEncoder;

// @ts-ignore
global.TextDecoder = TextDecoder;

// Minimal ProductApi stub so components that reference it at module-eval time
// (e.g. ExpandedView's static contextType) can be imported under test.
// @ts-ignore
window.ProductApi = {
    useWebSocketClient: jest.fn(),
    WebSocketProvider: React.createContext(null),
    selectRhsPost: jest.fn(),
};
