// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {CALL_ENDED, UN_INITIALIZED} from './common_action_types';
import {callEnded, unInitialized} from './common_actions';

describe('unInitialized', () => {
    test('returns the UN_INITIALIZED action', () => {
        expect(unInitialized()).toEqual({type: UN_INITIALIZED});
    });
});

describe('callEnded', () => {
    test('carries the channel and call ids', () => {
        expect(callEnded('channel1', 'call1')).toEqual({
            type: CALL_ENDED,
            data: {
                channelID: 'channel1',
                callID: 'call1',
            },
        });
    });
});
