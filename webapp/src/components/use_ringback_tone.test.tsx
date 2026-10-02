// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {act, renderHook} from '@testing-library/react';
import React from 'react';
import {Provider} from 'react-redux';
import {AnyAction, createStore} from 'redux';
import {PHONE_RINGBACK_TONE_TIMEOUT, RINGBACK_TONE_TIMEOUT} from 'src/constants';
import {playSound} from 'src/utils';

import {useRingbackTone} from './use_ringback_tone';

jest.mock('src/sounds/ringback.mp3', () => 'ringback.mp3');
jest.mock('src/utils', () => ({
    ...jest.requireActual('src/utils'),
    playSound: jest.fn(),
}));

const mockedPlaySound = playSound as jest.Mock;

type StateOptions = {
    channelType?: string;
    ringingEnabled?: boolean;
    phone?: boolean;
    sipState?: {status: string; answeredAt: number};
    otherSessions?: boolean;
};

const buildState = ({channelType = 'D', ringingEnabled = true, phone = false, sipState, otherSessions = false}: StateOptions) => ({
    'plugins-com.mattermost.calls': {
        calls: {
            'channel-id': {
                ID: 'call-id',
                channelID: 'channel-id',
                startAt: 1000,
                ownerID: 'user-id',
                threadID: 'thread-id',
                phone: phone ? {number: '+13125550174', displayNumber: '', label: '', targetUserID: ''} : undefined,
            },
        },
        sessions: {
            'channel-id': {
                'session-1': {session_id: 'session-1', user_id: 'user-id', unmuted: true, raised_hand: 0},
                ...(otherSessions && {'session-2': {session_id: 'session-2', user_id: 'other-user', unmuted: true, raised_hand: 0}}),
            },
        },
        sipCallStates: sipState ? {'channel-id': sipState} : {},
        callsConfig: {EnableRinging: ringingEnabled},
    },
    entities: {
        channels: {channels: {'channel-id': {id: 'channel-id', type: channelType, name: 'user-id__other-user'}}},
        users: {currentUserId: 'user-id', profiles: {'user-id': {id: 'user-id'}}},
    },
});

type TestState = ReturnType<typeof buildState>;

const REPLACE_STATE = 'test/replace_state';

// A store whose whole state can be swapped, so a test can move a call from ringing to answered.
const createTestStore = (initialState: TestState) =>
    createStore((state: TestState = initialState, action: AnyAction) => (action.type === REPLACE_STATE ? action.state : state));

describe('useRingbackTone', () => {
    let play: jest.Mock;
    let pause: jest.Mock;
    let audioInstances: number;

    const renderRingback = (state: TestState) => {
        const store = createTestStore(state);
        const wrapper = ({children}: {children: React.ReactNode}) => <Provider store={store}>{children}</Provider>;
        const hook = renderHook(() => useRingbackTone(), {wrapper});
        const replaceState = (nextState: TestState) => act(() => {
            store.dispatch({type: REPLACE_STATE, state: nextState});
        });
        return {...hook, replaceState};
    };

    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
        play = jest.fn(() => Promise.resolve());
        pause = jest.fn();
        audioInstances = 0;
        window.callsClient = {channelID: 'channel-id'} as unknown as (typeof window)['callsClient'];
        jest.spyOn(window, 'Audio').mockImplementation(() => {
            audioInstances++;
            return {play, pause, loop: false, src: ''} as unknown as HTMLAudioElement;
        });
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
        window.callsClient = undefined;
    });

    it('rings back the caller of a DM call until someone else joins', () => {
        const {unmount} = renderRingback(buildState({}));
        expect(play).toHaveBeenCalledTimes(1);

        unmount();
        expect(pause).toHaveBeenCalled();
    });

    it('does not ring back a DM call when ringing is disabled', () => {
        renderRingback(buildState({ringingEnabled: false}));
        expect(play).not.toHaveBeenCalled();
    });

    it('rings back a phone call even when ringing is disabled', () => {
        renderRingback(buildState({ringingEnabled: false, phone: true, sipState: {status: 'ringing', answeredAt: 0}}));
        expect(play).toHaveBeenCalledTimes(1);
    });

    it('stops the phone ringback and plays the join sound once the phone leg is active', () => {
        const {replaceState} = renderRingback(buildState({phone: true, sipState: {status: 'ringing', answeredAt: 0}}));
        expect(play).toHaveBeenCalledTimes(1);
        expect(mockedPlaySound).not.toHaveBeenCalled();

        replaceState(buildState({phone: true, sipState: {status: 'active', answeredAt: 2000}}));

        expect(pause).toHaveBeenCalled();
        expect(mockedPlaySound).toHaveBeenCalledTimes(1);
        expect(mockedPlaySound).toHaveBeenCalledWith('join_user');

        // Hanging up afterwards must not ring again or replay the join sound.
        replaceState(buildState({phone: true, sipState: {status: 'hangup', answeredAt: 2000}}));
        expect(audioInstances).toBe(1);
        expect(mockedPlaySound).toHaveBeenCalledTimes(1);
    });

    it('stops the DM ringback when the other party joins, leaving the join sound to joinUser', () => {
        const {replaceState} = renderRingback(buildState({}));
        expect(play).toHaveBeenCalledTimes(1);

        replaceState(buildState({otherSessions: true}));

        expect(pause).toHaveBeenCalled();
        expect(mockedPlaySound).not.toHaveBeenCalled();
    });

    it('gives a phone call longer to be answered than a DM call', () => {
        renderRingback(buildState({phone: true, sipState: {status: 'ringing', answeredAt: 0}}));

        jest.advanceTimersByTime(RINGBACK_TONE_TIMEOUT + 1);
        expect(pause).not.toHaveBeenCalled();

        jest.advanceTimersByTime(PHONE_RINGBACK_TONE_TIMEOUT - RINGBACK_TONE_TIMEOUT);
        expect(pause).toHaveBeenCalled();
    });
});
