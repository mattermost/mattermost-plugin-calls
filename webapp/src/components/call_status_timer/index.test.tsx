// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {UserSessionState} from '@mattermost/calls-common/lib/types';
import type {Channel} from '@mattermost/types/channels';
import {render} from '@testing-library/react';
import React from 'react';
import {createIntl, RawIntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {DM_CALLEE_ANSWERED_AT} from 'src/action_types';
import type CallsClient from 'src/client';
import {mockStore} from 'src/testUtils';
import type {CurrentCallData} from 'src/types/types';

import {CallStatusTimer} from '.';

const intl = createIntl({locale: 'en', messages: {}});

const channelID = 'dm-channel-id';
const callID = 'call-id';
const currentUserID = 'user-id';
const otherUserID = 'other-user-id';

const dmChannel = {
    id: channelID,
    name: `${currentUserID}__${otherUserID}`,
    display_name: 'Other User',
    type: 'D',
} as Channel;

const channelCallChannel = {
    id: channelID,
    name: 'town-square',
    display_name: 'Town Square',
    type: 'O',
} as Channel;

const stubSession = (sessionID: string, userID: string) => ({
    session_id: sessionID,
    user_id: userID,
    unmuted: false,
    raised_hand: 0,
} as UserSessionState);

const ownSession = stubSession('own-session', currentUserID);
const otherSession = stubSession('other-session', otherUserID);

type StateOpts = {
    startAt: number;
    answeredAt?: number;
    ownerID?: string;
    sessions?: UserSessionState[];
    channel?: Channel | null;
}

const stubState = ({startAt, answeredAt, ownerID = currentUserID, sessions = [ownSession], channel = dmChannel}: StateOpts) => ({
    'plugins-com.mattermost.calls': {
        calls: {
            [channelID]: {ID: callID, channelID, startAt, ownerID, threadID: ''},
        },
        sessions: {
            [channelID]: Object.fromEntries(sessions.map((s) => [s.session_id, s])),
        },
        dmCalleeAnsweredAt: answeredAt ? {[callID]: answeredAt} : {},
    },
    entities: {
        channels: {channels: channel ? {[channel.id]: channel} : {}},
        users: {
            currentUserId: currentUserID,
            profiles: {[otherUserID]: {id: otherUserID, username: 'other'}},
        },
    },
});

const renderTimer = (state: ReturnType<typeof stubState>, clientConnecting = false) => {
    const store = mockStore(state);
    const dispatch = jest.spyOn(store, 'dispatch');
    const {container} = render(
        <Provider store={store}>
            <RawIntlProvider value={intl}>
                <CallStatusTimer clientConnecting={clientConnecting}/>
            </RawIntlProvider>
        </Provider>,
    );
    return {container, dispatch};
};

// Only the caller is ever in the ringing state: the callee joining is what answers the call.
const ringingState = () => stubState({startAt: Date.now() - 65_000, sessions: [ownSession]});

describe('CallStatusTimer', () => {
    let initTime = 0;

    beforeEach(() => {
        initTime = Date.now();
        window.callsClient = {
            channelID,
            get initTime() {
                return initTime;
            },
            getSessionID: () => ownSession.session_id,
        } as unknown as CallsClient;
        window.currentCallData = {dmCalleeAnsweredAt: 0} as CurrentCallData;
    });

    afterEach(() => {
        delete window.callsClient;
        delete window.currentCallData;
    });

    test('should show the calling label instead of a duration while a DM call rings', () => {
        const {container} = renderTimer(ringingState());

        expect(container.textContent).toBe('Calling…');
    });

    test('should not show any digits while a DM call rings', () => {
        const {container} = renderTimer(ringingState());

        expect(container.textContent).not.toMatch(/\d/);
    });

    test('should show the starting label while the DM call client is still connecting', () => {
        const {container} = renderTimer(stubState({
            startAt: Date.now() - 65_000,
            sessions: [ownSession, otherSession],
        }), true);

        expect(container.textContent).toBe('Starting call…');
    });

    test('should prefer the starting label over the calling label while connecting', () => {
        const {container} = renderTimer(ringingState(), true);

        expect(container.textContent).toBe('Starting call…');
    });

    test('should pulse the label while connecting so it reads as in-progress', () => {
        const {container} = renderTimer(ringingState(), true);

        expect(container.querySelector('.callStatusTimer')).toHaveClass('pulsingAnimation');
    });

    test('should show the duration rather than the starting label for a channel call that is connecting', () => {
        const {container} = renderTimer(stubState({
            startAt: Date.now() - 65_000,
            channel: channelCallChannel,
            sessions: [ownSession, otherSession],
        }), true);

        expect(container.textContent).toMatch(/^01:0[45]$/);
    });

    test('should render nothing when the call channel is not in the store yet', () => {
        const {container} = renderTimer(stubState({
            startAt: Date.now() - 65_000,
            channel: null,
        }), true);

        expect(container).toBeEmptyDOMElement();
    });

    test('should count from when the call was answered, not from when it started', () => {
        const {container} = renderTimer(stubState({
            startAt: Date.now() - 300_000,
            answeredAt: Date.now() - 65_000,
            sessions: [ownSession, otherSession],
        }));

        expect(container.textContent).toMatch(/^01:0[45]$/);
    });

    test('should count from the client init time for the callee, who answered by joining', () => {
        initTime = Date.now() - 65_000;

        const {container} = renderTimer(stubState({
            startAt: Date.now() - 300_000,
            ownerID: otherUserID,
            sessions: [ownSession, otherSession],
        }));

        expect(container.textContent).toMatch(/^01:0[45]$/);
    });

    test('should fall back to the call start time when nothing recorded the answer', () => {
        const {container} = renderTimer(stubState({
            startAt: Date.now() - 65_000,
            sessions: [ownSession, otherSession],
        }));

        expect(container.textContent).toMatch(/^01:0[45]$/);
    });

    // A popout has its own store and may be opened after the call was answered, so it never
    // saw the other party join. It should adopt the shared timestamp rather than restart.
    test('should seed the answered time from the calls window when the store has none', () => {
        const sharedAnsweredAt = Date.now() - 65_000;
        window.currentCallData = {dmCalleeAnsweredAt: sharedAnsweredAt} as CurrentCallData;

        const {dispatch} = renderTimer(stubState({
            startAt: Date.now() - 300_000,
            sessions: [ownSession, otherSession],
        }));

        expect(dispatch).toHaveBeenCalledWith({
            type: DM_CALLEE_ANSWERED_AT,
            data: {callID, answeredAt: sharedAnsweredAt},
        });
    });

    test('should not seed when the store already knows when the call was answered', () => {
        window.currentCallData = {dmCalleeAnsweredAt: Date.now() - 300_000} as CurrentCallData;

        const {dispatch} = renderTimer(stubState({
            startAt: Date.now() - 300_000,
            answeredAt: Date.now() - 65_000,
            sessions: [ownSession, otherSession],
        }));

        expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({type: DM_CALLEE_ANSWERED_AT}));
    });

    test('should count from the call start time for a channel call', () => {
        const {container} = renderTimer(stubState({
            startAt: Date.now() - 65_000,
            channel: channelCallChannel,
            sessions: [ownSession, otherSession],
        }));

        expect(container.textContent).toMatch(/^01:0[45]$/);
    });
});
