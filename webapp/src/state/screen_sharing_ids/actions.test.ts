// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {USER_SCREEN_OFF, USER_SCREEN_ON} from './action_types';
import {userScreenShared, userScreenUnshared} from './actions';

describe('userScreenShared', () => {
    test('builds the USER_SCREEN_ON action', () => {
        expect(userScreenShared('channel1', 'session1', 'user1')).toEqual({
            type: USER_SCREEN_ON,
            data: {
                channelID: 'channel1',
                session_id: 'session1',
                userID: 'user1',
            },
        });
    });
});

describe('userScreenUnshared', () => {
    test('builds the USER_SCREEN_OFF action', () => {
        expect(userScreenUnshared('channel1', 'session1', 'user1')).toEqual({
            type: USER_SCREEN_OFF,
            data: {
                channelID: 'channel1',
                session_id: 'session1',
                userID: 'user1',
            },
        });
    });
});
