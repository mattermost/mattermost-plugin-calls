// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {act, renderHook} from '@testing-library/react';
import type {VideoTrack} from 'livekit-client';
import React from 'react';
import {Provider} from 'react-redux';
import {CALL_EVENT} from 'src/clients/call/constants';
import type {ScreenSharingSession} from 'src/clients/call/types';
import {FakeCallClient, installFakeCallClient} from 'src/test_utils/fake_call_client';
import {mockStore} from 'src/testUtils';

import {useScreenShareTrack} from './use_screen_share_track';

const LOCAL_SESSION_ID = 'local-session';
const REMOTE_SESSION_ID = 'remote-session';

const makeTrack = () => ({}) as VideoTrack;

const store = mockStore({
    'plugins-com.mattermost.calls': {
        sessions: {
            'channel-id': {
                [LOCAL_SESSION_ID]: {session_id: LOCAL_SESSION_ID, user_id: 'local-user'},
                [REMOTE_SESSION_ID]: {session_id: REMOTE_SESSION_ID, user_id: 'remote-user'},
            },
        },
    },
});

const wrapper = ({children}: {children: React.ReactNode}) => <Provider store={store}>{children}</Provider>;

describe('useScreenShareTrack', () => {
    let client: FakeCallClient;

    beforeEach(() => {
        client = installFakeCallClient();
        client.getSessionID.mockReturnValue(LOCAL_SESSION_ID);
    });

    afterEach(() => {
        window.callsClient = undefined;
    });

    test('is null when nobody is sharing', () => {
        const {result} = renderHook(() => useScreenShareTrack(), {wrapper});

        expect(result.current).toBeNull();
    });

    test('is null without a call client', () => {
        window.callsClient = undefined;

        const {result} = renderHook(() => useScreenShareTrack(), {wrapper});

        expect(result.current).toBeNull();
    });

    test('starts from our own track when we are already sharing', () => {
        const track = makeTrack();
        client.screenSharingSessionID = LOCAL_SESSION_ID;
        client.localScreenTrack = track;
        client.remoteScreenTrack = makeTrack();

        const {result} = renderHook(() => useScreenShareTrack(), {wrapper});

        expect(result.current).toEqual({sessionID: LOCAL_SESSION_ID, userID: 'local-user', isLocal: true, track});
    });

    test('starts from the remote track when someone else is sharing', () => {
        const track = makeTrack();
        client.screenSharingSessionID = REMOTE_SESSION_ID;
        client.remoteScreenTrack = track;

        const {result} = renderHook(() => useScreenShareTrack(), {wrapper});

        expect(result.current).toEqual({sessionID: REMOTE_SESSION_ID, userID: 'remote-user', isLocal: false, track});
    });

    test('starts with a null track while a remote share is not yet subscribed', () => {
        client.screenSharingSessionID = REMOTE_SESSION_ID;

        const {result} = renderHook(() => useScreenShareTrack(), {wrapper});

        expect(result.current).toEqual({sessionID: REMOTE_SESSION_ID, userID: 'remote-user', isLocal: false, track: null});
    });

    test('follows SCREEN_SHARING_CHANGED, including back to null', () => {
        const {result} = renderHook(() => useScreenShareTrack(), {wrapper});

        const first: ScreenSharingSession = {sessionID: REMOTE_SESSION_ID, userID: 'remote-user', isLocal: false, track: makeTrack()};
        act(() => client.setScreenShare(first));
        expect(result.current).toBe(first);

        const second: ScreenSharingSession = {sessionID: LOCAL_SESSION_ID, userID: 'local-user', isLocal: true, track: makeTrack()};
        act(() => client.setScreenShare(second));
        expect(result.current).toBe(second);

        act(() => client.setScreenShare(null));
        expect(result.current).toBeNull();
    });

    test('keeps the same object when an event reports no change', () => {
        const track = makeTrack();
        client.screenSharingSessionID = REMOTE_SESSION_ID;
        client.remoteScreenTrack = track;
        const {result} = renderHook(() => useScreenShareTrack(), {wrapper});
        const before = result.current;

        act(() => client.setScreenShare({sessionID: REMOTE_SESSION_ID, userID: 'remote-user', isLocal: false, track}));

        expect(result.current).toBe(before);
    });

    test('removes its listener on unmount', () => {
        const {unmount} = renderHook(() => useScreenShareTrack(), {wrapper});
        expect(client.listenerCount(CALL_EVENT.SCREEN_SHARING_CHANGED)).toBe(1);

        unmount();

        expect(client.listenerCount(CALL_EVENT.SCREEN_SHARING_CHANGED)).toBe(0);
    });
});
