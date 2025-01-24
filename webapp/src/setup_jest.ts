// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {TextDecoder, TextEncoder} from 'util';

global.TextEncoder = TextEncoder;

// @ts-ignore
global.TextDecoder = TextDecoder;
