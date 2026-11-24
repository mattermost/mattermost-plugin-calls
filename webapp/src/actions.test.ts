// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {setThreadFollow} from 'mattermost-redux/actions/threads';
import {logDebug, logErr} from 'src/log';
import {Store} from 'src/types/mattermost-webapp';

import {followThread} from './actions';

jest.mock('mattermost-redux/actions/threads', () => ({
    ...jest.requireActual('mattermost-redux/actions/threads'),
    setThreadFollow: jest.fn((userID, teamID, threadID, follow) => ({type: 'mock/setThreadFollow', userID, teamID, threadID, follow})),
}));
jest.mock('src/log', () => ({
    ...jest.requireActual('src/log'),
    logDebug: jest.fn(),
    logErr: jest.fn(),
}));

describe('followThread', () => {
    const makeStore = (threadID?: string) => ({
        dispatch: jest.fn(),
        getState: () => ({
            entities: {users: {currentUserId: 'userID'}},
            'plugins-com.mattermost.calls': {
                calls: {channelID: {threadID}},
            },
        }),
    } as unknown as Store);

    test('follows the thread of the call', async () => {
        const store = makeStore('threadID');

        await followThread(store, 'channelID', 'teamID');

        expect(setThreadFollow).toHaveBeenCalledWith('userID', 'teamID', 'threadID', true);
        expect(store.dispatch).toHaveBeenCalledWith({
            type: 'mock/setThreadFollow',
            userID: 'userID',
            teamID: 'teamID',
            threadID: 'threadID',
            follow: true,
        });
    });

    test('does nothing without a team', async () => {
        const store = makeStore('threadID');

        await followThread(store, 'channelID');

        expect(logDebug).toHaveBeenCalledWith('followThread: no team for channel');
        expect(store.dispatch).not.toHaveBeenCalled();
    });

    test('logs an error when the call has no thread in the store', async () => {
        const store = makeStore();

        await followThread(store, 'channelID', 'teamID');

        expect(logErr).toHaveBeenCalledWith('Unable to follow call\'s thread, not registered in store');
        expect(store.dispatch).not.toHaveBeenCalled();
    });
});
