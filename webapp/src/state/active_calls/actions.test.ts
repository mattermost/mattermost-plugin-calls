// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {ACTIVE_CALL_ADDED} from './action_types';
import {activeCallAdded} from './actions';
import {type ActiveCall} from './reducer';

const call: Omit<ActiveCall, 'channelID'> = {
    callID: 'call1',
    startAt: 100,
    threadID: 'thread1',
    ownerID: 'owner1',
};

describe('activeCallAdded', () => {
    test('builds the ACTIVE_CALL_ADDED action with the channel id merged in', () => {
        expect(activeCallAdded('channel1', call)).toEqual({
            type: ACTIVE_CALL_ADDED,
            data: {
                callID: 'call1',
                startAt: 100,
                channelID: 'channel1',
                threadID: 'thread1',
                ownerID: 'owner1',
            },
        });
    });

    test('uses the channel id argument, not any channel id on the call object', () => {
        const action = activeCallAdded('channel1', {...call, channelID: 'other'} as Omit<ActiveCall, 'channelID'>);
        expect(action.data.channelID).toBe('channel1');
    });
});
