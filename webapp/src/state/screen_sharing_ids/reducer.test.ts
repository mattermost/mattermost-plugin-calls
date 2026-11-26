// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {CALL_END, UN_INITIALIZED, USER_LEFT} from 'src/state/session/action_types';

import {screenSharingCleared, userScreenShared, userScreenUnshared} from './actions';
import {reducer} from './reducer';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (actions: any[], initial?: Record<string, string>) => {
    return actions.reduce((state, action) => reducer(state, action), initial ?? reducer(undefined, {type: '@@INIT'} as never));
};

describe('screen_sharing_ids reducer', () => {
    describe('USER_SCREEN_ON', () => {
        it('records the sharer session for the channel', () => {
            expect(run([userScreenShared('ch1', 'session1', 'user1')])).toEqual({ch1: 'session1'});
        });
    });

    describe('USER_SCREEN_OFF (websocket path keeps its session id guard)', () => {
        it('clears when the session id matches the current sharer', () => {
            const state = run([
                userScreenShared('ch1', 'session1', 'user1'),
                userScreenUnshared('ch1', 'session1', 'user1'),
            ]);
            expect(state).toEqual({});
        });

        it('ignores a late off for a session that is not the current sharer', () => {
            const state = run([
                userScreenShared('ch1', 'session2', 'user2'),
                userScreenUnshared('ch1', 'session1', 'user1'),
            ]);
            expect(state).toEqual({ch1: 'session2'});
        });

        it('does not treat an empty session id as a wildcard', () => {
            const state = run([
                userScreenShared('ch1', 'session1', 'user1'),
                userScreenUnshared('ch1', '', ''),
            ]);
            expect(state).toEqual({ch1: 'session1'});
        });
    });

    describe('screenSharingCleared', () => {
        it('clears the channel regardless of which session was sharing', () => {
            const state = run([
                userScreenShared('ch1', 'session1', 'user1'),
                screenSharingCleared('ch1'),
            ]);
            expect(state).toEqual({});
        });

        it('only clears the given channel', () => {
            const state = run([
                userScreenShared('ch1', 'session1', 'user1'),
                userScreenShared('ch2', 'session2', 'user2'),
                screenSharingCleared('ch1'),
            ]);
            expect(state).toEqual({ch2: 'session2'});
        });

        it('is a no-op when nobody is sharing', () => {
            const initial = {ch2: 'session2'};
            expect(run([screenSharingCleared('ch1')], initial)).toBe(initial);
        });
    });

    describe('other clearing paths', () => {
        it('clears when the sharer leaves', () => {
            const state = run([
                userScreenShared('ch1', 'session1', 'user1'),
                {type: USER_LEFT, data: {channelID: 'ch1', session_id: 'session1', userID: 'user1'}},
            ]);
            expect(state).toEqual({});
        });

        it('clears on call end', () => {
            const state = run([
                userScreenShared('ch1', 'session1', 'user1'),
                {type: CALL_END, data: {channelID: 'ch1'}},
            ]);
            expect(state).toEqual({});
        });

        it('resets on un-initialize', () => {
            const state = run([
                userScreenShared('ch1', 'session1', 'user1'),
                {type: UN_INITIALIZED},
            ]);
            expect(state).toEqual({});
        });
    });
});
