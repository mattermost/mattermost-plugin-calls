// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {ScreenSharingSession} from 'src/clients/call/types';
import {applyScreenSharingChanged} from 'src/screen_sharing';
import {reducer} from 'src/state/screen_sharing_ids/reducer';

// A minimal store backed by the real screen_sharing_ids reducer, so the test
// asserts on the resulting state and not on which actions were dispatched.
const newStore = () => {
    let state = reducer(undefined, {type: '@@INIT'} as never);
    return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        dispatch: (action: any) => {
            state = reducer(state, action);
        },
        sharing: () => state,
    };
};

const session = (sessionID: string, userID: string) => ({
    sessionID,
    userID,
    isLocal: false,
    track: {},
} as unknown as ScreenSharingSession);

describe('applyScreenSharingChanged', () => {
    it('records the current sharer', () => {
        const store = newStore();
        applyScreenSharingChanged(store, 'ch1', session('session1', 'user1'));
        expect(store.sharing()).toEqual({ch1: 'session1'});
    });

    // The MM-71625 / MM-72230 regression: standalone (Desktop widget, recorder)
    // has no websocket user_screen_off to fall back on, so a null session must
    // clear the sharer on its own.
    it('clears the sharer when sharing stops', () => {
        const store = newStore();
        applyScreenSharingChanged(store, 'ch1', session('session1', 'user1'));
        applyScreenSharingChanged(store, 'ch1', null);
        expect(store.sharing()).toEqual({});
    });

    it('moves to the new sharer when the derived sharer changes', () => {
        const store = newStore();
        applyScreenSharingChanged(store, 'ch1', session('session1', 'user1'));
        applyScreenSharingChanged(store, 'ch1', session('session2', 'user2'));
        expect(store.sharing()).toEqual({ch1: 'session2'});
    });

    it('does not touch other channels when clearing', () => {
        const store = newStore();
        applyScreenSharingChanged(store, 'ch1', session('session1', 'user1'));
        applyScreenSharingChanged(store, 'ch2', session('session2', 'user2'));
        applyScreenSharingChanged(store, 'ch1', null);
        expect(store.sharing()).toEqual({ch2: 'session2'});
    });

    it('is a no-op when nothing was being shared', () => {
        const store = newStore();
        applyScreenSharingChanged(store, 'ch1', null);
        expect(store.sharing()).toEqual({});
    });
});
