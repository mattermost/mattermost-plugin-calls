// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {act, render, screen} from '@testing-library/react';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {createStore} from 'redux';
import {HostControlNoticeType} from 'src/types/types';

import CallNoticeStack from './call_notice_stack';
import {NOTICE_FADE_MS, NOTICE_TIMEOUT_MS} from './notice_queue';

const CHANNEL_ID = 'channel-id';

const session = (id: string, raisedHand = 0) => ({session_id: id, user_id: `user-${id}`, unmuted: false, raised_hand: raisedHand});

type CallState = {
    sessions: Record<string, ReturnType<typeof session>>;
    recording?: {init_at: number; start_at: number; end_at: number};
    hostNotices?: Array<{type: HostControlNoticeType; callID: string; noticeID: string; displayName: string; userID?: string}>;
};

const buildState = ({sessions, recording, hostNotices = []}: CallState) => ({
    entities: {
        users: {
            currentUserId: 'user-self',
            profiles: {
                'user-self': {id: 'user-self', username: 'me'},
                'user-other': {id: 'user-other', username: 'alice'},
            },
        },
        channels: {currentChannelId: CHANNEL_ID},
        preferences: {myPreferences: {}},
        general: {config: {}},
    },
    'plugins-com.mattermost.calls': {
        clientStateReducer: {channelID: CHANNEL_ID},
        sessions: {[CHANNEL_ID]: sessions},
        calls: {[CHANNEL_ID]: {ID: 'call-id', channelID: CHANNEL_ID}},
        recordings: recording ? {[CHANNEL_ID]: recording} : {},
        hostControlNotices: {'call-id': hostNotices},
    },
});

describe('CallNoticeStack', () => {
    let current: ReturnType<typeof buildState>;
    let store: ReturnType<typeof createStore>;

    const setCall = (call: CallState) => {
        current = buildState(call);
        act(() => {
            store.dispatch({type: 'SET', state: current});
        });
    };

    const renderStack = (call: CallState) => {
        current = buildState(call);
        store = createStore((state = current, action: {type: string; state?: typeof current}) => action.state ?? state);
        render(
            <Provider store={store}>
                <IntlProvider locale='en'>
                    <CallNoticeStack currentSessionID='self'/>
                </IntlProvider>
            </Provider>,
        );
    };

    const messages = () => screen.queryAllByRole('listitem').map((li) => li.textContent);

    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('is a polite, labelled log', () => {
        renderStack({sessions: {self: session('self')}});

        const log = screen.getByRole('log', {name: 'Call notifications'});
        expect(log).toHaveAttribute('aria-live', 'polite');
    });

    test('does not announce people already in the call', () => {
        renderStack({sessions: {self: session('self'), other: session('other')}});

        expect(messages()).toEqual([]);
    });

    test('announces someone joining and leaving', () => {
        renderStack({sessions: {self: session('self')}});

        setCall({sessions: {self: session('self'), other: session('other')}});
        expect(messages()).toEqual(['alice joined the call']);

        setCall({sessions: {self: session('self')}});
        expect(messages()).toEqual(['alice joined the call', 'alice left the call']);
    });

    test('announces a raised hand', () => {
        renderStack({sessions: {self: session('self'), other: session('other')}});

        setCall({sessions: {self: session('self'), other: session('other', 1000)}});

        expect(messages()).toEqual(['alice raised their hand']);
    });

    test('announces recording starting and stopping', () => {
        renderStack({sessions: {self: session('self')}, recording: {init_at: 1, start_at: 0, end_at: 0}});

        setCall({sessions: {self: session('self')}, recording: {init_at: 1, start_at: 2, end_at: 0}});
        setCall({sessions: {self: session('self')}, recording: {init_at: 1, start_at: 2, end_at: 3}});

        expect(messages()).toEqual(['Recording started', 'Recording stopped']);
    });

    test('shows new host notices once', () => {
        const notice = {type: HostControlNoticeType.HostChanged, callID: CHANNEL_ID, noticeID: 'n1', displayName: 'me', userID: 'user-self'};
        renderStack({sessions: {self: session('self')}});

        setCall({sessions: {self: session('self')}, hostNotices: [notice]});
        setCall({sessions: {self: session('self')}, hostNotices: [notice]});

        expect(messages()).toEqual(['You are now the host']);
    });

    test.each([
        [HostControlNoticeType.LowerHand, 'bob', 'bob lowered your hand', 'hand'],
        [HostControlNoticeType.HostChanged, 'alice', 'alice is now the host', 'host'],
        [HostControlNoticeType.HostRemoved, 'carol', 'carol was removed from the call', 'removed'],
    ])('shows a %s host notice', (type, displayName, message, kind) => {
        renderStack({sessions: {self: session('self')}});

        setCall({sessions: {self: session('self')}, hostNotices: [{type, callID: CHANNEL_ID, noticeID: 'n1', displayName, userID: 'user-other'}]});

        expect(messages()).toEqual([message]);
        expect(screen.getByRole('listitem')).toHaveAttribute('data-kind', kind);
    });

    test('does not repeat host notices that were there before it mounted', () => {
        const notice = {type: HostControlNoticeType.HostRemoved, callID: CHANNEL_ID, noticeID: 'n1', displayName: 'carol'};
        renderStack({sessions: {self: session('self')}, hostNotices: [notice]});

        setCall({sessions: {self: session('self'), other: session('other')}, hostNotices: [notice]});

        expect(messages()).toEqual(['alice joined the call']);
    });

    test('names someone without a profile "Someone"', () => {
        renderStack({sessions: {self: session('self')}});

        setCall({sessions: {self: session('self'), ghost: session('ghost')}});

        expect(messages()).toEqual(['Someone joined the call']);
    });

    test('removes a notice without the fade when reduced motion is preferred', () => {
        Object.defineProperty(window, 'matchMedia', {
            configurable: true,
            writable: true,
            value: jest.fn((query: string) => ({matches: query === '(prefers-reduced-motion: reduce)'})),
        });
        try {
            renderStack({sessions: {self: session('self')}});
            setCall({sessions: {self: session('self'), other: session('other')}});

            act(() => {
                jest.advanceTimersByTime(NOTICE_TIMEOUT_MS);
            });
            expect(screen.getByRole('listitem')).toHaveClass('CallNoticeStack__notice--leaving');

            // Fake timers run a zero delay set during a tick 1ms later.
            act(() => {
                jest.advanceTimersByTime(1);
            });
            expect(messages()).toEqual([]);
        } finally {
            Reflect.deleteProperty(window, 'matchMedia');
        }
    });

    test('fades a notice after 3 seconds', () => {
        renderStack({sessions: {self: session('self')}});
        setCall({sessions: {self: session('self'), other: session('other')}});

        act(() => {
            jest.advanceTimersByTime(NOTICE_TIMEOUT_MS);
        });
        expect(screen.getByRole('listitem')).toHaveClass('CallNoticeStack__notice--leaving');

        act(() => {
            jest.advanceTimersByTime(NOTICE_FADE_MS);
        });
        expect(messages()).toEqual([]);
    });

    test('keeps at most five notices', () => {
        renderStack({sessions: {self: session('self')}});
        for (let i = 0; i < 3; i++) {
            setCall({sessions: {self: session('self'), other: session('other')}});
            setCall({sessions: {self: session('self')}});
        }

        expect(messages()).toHaveLength(5);
        expect(messages()[4]).toBe('alice left the call');
    });
});
