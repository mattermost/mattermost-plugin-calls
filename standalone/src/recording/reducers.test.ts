// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {RECEIVED_CALL_PROFILE_IMAGES, storeKey} from './action_types';
import reducer from './reducers';
import {callProfileImages as selectCallProfileImages} from './selectors';

const receivedAction = (
    channelID: string,
    profileImages: Record<string, string>,
) => ({
    type: RECEIVED_CALL_PROFILE_IMAGES,
    data: {channelID, profileImages},
});

describe('callProfileImages', () => {
    const buildState = (
        channelID: string,
        profileImages: Record<string, string>,
    ) => ({
        [storeKey]: reducer(undefined, receivedAction(channelID, profileImages)),
    });

    it('defaults to an empty map', () => {
        const state = reducer(undefined, {type: '@@INIT'});
        expect(state).toEqual({callProfileImages: {}});
    });

    it('stores profile images for a new channel', () => {
        const state = reducer(
            undefined,
            receivedAction('channel1', {user1: 'img1'}),
        );
        expect(state.callProfileImages).toEqual({
            channel1: {user1: 'img1'},
        });
    });

    it('merges new users into an existing channel without dropping prior ones', () => {
        const first = reducer(
            undefined,
            receivedAction('channel1', {user1: 'img1'}),
        );
        const second = reducer(
            first,
            receivedAction('channel1', {user2: 'img2'}),
        );
        expect(second.callProfileImages).toEqual({
            channel1: {user1: 'img1', user2: 'img2'},
        });
    });

    it('keeps channels isolated from one another', () => {
        const first = reducer(
            undefined,
            receivedAction('channel1', {user1: 'img1'}),
        );
        const second = reducer(
            first,
            receivedAction('channel2', {user2: 'img2'}),
        );
        expect(second.callProfileImages).toEqual({
            channel1: {user1: 'img1'},
            channel2: {user2: 'img2'},
        });
    });

    it('returns the same state reference for unrelated actions', () => {
        const state = reducer(
            undefined,
            receivedAction('channel1', {user1: 'img1'}),
        );
        const next = reducer(state, {type: 'SOME_OTHER_ACTION'});
        expect(next).toBe(state);
    });

    it('returns the profile images for a known channel', () => {
        const state = buildState('channel1', {user1: 'img1'});
        expect(selectCallProfileImages(state as never, 'channel1')).toEqual({
            user1: 'img1',
        });
    });

    it('returns an empty object for an unknown channel', () => {
        const state = buildState('channel1', {user1: 'img1'});
        expect(selectCallProfileImages(state as never, 'channel2')).toEqual({});
    });
});
