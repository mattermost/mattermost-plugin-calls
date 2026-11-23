// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {act, render} from '@testing-library/react';
import {EventEmitter} from 'events';
import type {VideoTrack} from 'livekit-client';
import React from 'react';
import {Provider} from 'react-redux';
import {AnyAction, createStore} from 'redux';
import type CallClient from 'src/clients/call';
import {CALL_EVENT} from 'src/clients/call/constants';
import {CameraState, type CameraTrack} from 'src/clients/call/types';
import {STORAGE_CALLS_MIRROR_VIDEO} from 'src/constants';

import ConnectedVideoTile from './index';
import VideoTile, {Props as VideoTileProps} from './video_tile';

jest.mock('./video_tile', () => ({
    __esModule: true,
    default: jest.fn(() => null),
}));

const mockedVideoTile = VideoTile as jest.MockedFunction<typeof VideoTile>;

const CHANNEL_ID = 'channel-id';

const makeTrack = () => ({}) as VideoTrack;

class FakeClient extends EventEmitter {
    channelID = CHANNEL_ID;
    cameras = new Map<string, CameraTrack>();
    getCameraTrack = (sessionID: string) => this.cameras.get(sessionID) ?? {state: CameraState.Off, track: null};

    setCamera(sessionID: string, camera: CameraTrack) {
        this.cameras.set(sessionID, camera);
        this.emit(CALL_EVENT.CAMERA_CHANGED, sessionID, `user-${sessionID}`, camera.state);
    }
}

const buildState = (connectionQuality: Record<string, string> = {}) => ({
    'plugins-com.mattermost.calls': {
        sessions: {
            [CHANNEL_ID]: {
                s1: {session_id: 's1', user_id: 'u1', unmuted: true, raised_hand: 0},
                s2: {session_id: 's2', user_id: 'u2', unmuted: false, raised_hand: 0},
            },
        },
        connectionQuality: {[CHANNEL_ID]: connectionQuality},
    },
    entities: {
        users: {
            profiles: {
                u1: {id: 'u1', username: 'one'},
                u2: {id: 'u2', username: 'two'},
            },
        },
    },
});

type TestState = ReturnType<typeof buildState>;

const REPLACE_STATE = 'test/replace_state';

const lastProps = (): VideoTileProps => mockedVideoTile.mock.calls[mockedVideoTile.mock.calls.length - 1][0];

describe('ConnectedVideoTile', () => {
    let client: FakeClient;
    const originalCallsClient = window.callsClient;

    const renderTile = (props: Partial<React.ComponentProps<typeof ConnectedVideoTile>> = {}, state = buildState()) => {
        const store = createStore((s: TestState = state, action: AnyAction) => (action.type === REPLACE_STATE ? action.state : s));
        const result = render(
            <Provider store={store}>
                <ConnectedVideoTile
                    sessionID='s1'
                    size='large'
                    {...props}
                />
            </Provider>,
        );
        const replaceState = (next: TestState) => act(() => {
            store.dispatch({type: REPLACE_STATE, state: next});
        });
        return {...result, replaceState};
    };

    beforeEach(() => {
        client = new FakeClient();
        window.callsClient = client as unknown as CallClient;
        window.localStorage.removeItem(STORAGE_CALLS_MIRROR_VIDEO);
        mockedVideoTile.mockClear();
    });

    afterEach(() => {
        window.callsClient = originalCallsClient;
        window.localStorage.removeItem(STORAGE_CALLS_MIRROR_VIDEO);
    });

    test('maps its session, profile, camera and connection to the tile', () => {
        const track = makeTrack();
        client.cameras.set('s1', {state: CameraState.Ready, track});

        renderTile({size: 'small', hideMuteState: true, className: 'extra'}, buildState({s1: 'poor'}));

        expect(lastProps()).toEqual({
            session: {session_id: 's1', user_id: 'u1', unmuted: true, raised_hand: 0},
            profile: {id: 'u1', username: 'one'},
            track,
            cameraState: CameraState.Ready,
            connectionState: 'poor',
            size: 'small',
            isSelf: false,
            isMirrored: false,
            hideMuteState: true,
            className: 'extra',
        });
    });

    test('defaults to a good connection', () => {
        renderTile({sessionID: 's2'}, buildState({s1: 'reconnecting'}));

        expect(lastProps().connectionState).toBe('good');
        expect(lastProps().session.session_id).toBe('s2');
    });

    test('renders nothing for a session that is not in the call', () => {
        renderTile({sessionID: 'missing'});

        expect(mockedVideoTile).not.toHaveBeenCalled();
    });

    test.each([
        [true, 'on', true],
        [true, 'off', false],
        [false, 'on', false],
    ])('with isSelf %s and the mirror preference %s, isMirrored is %s', (isSelf, preference, expected) => {
        window.localStorage.setItem(STORAGE_CALLS_MIRROR_VIDEO, preference);

        renderTile({isSelf});

        expect(lastProps().isSelf).toBe(isSelf);
        expect(lastProps().isMirrored).toBe(expected);
    });

    test('follows its own session through loading and ready', () => {
        renderTile();
        expect(lastProps().cameraState).toBe(CameraState.Off);

        act(() => client.setCamera('s1', {state: CameraState.Loading, track: null}));
        expect(lastProps()).toMatchObject({cameraState: CameraState.Loading, track: null});

        const track = makeTrack();
        act(() => client.setCamera('s1', {state: CameraState.Ready, track}));
        expect(lastProps()).toMatchObject({cameraState: CameraState.Ready, track});
    });

    test('does not re-render for another session\'s camera events', () => {
        renderTile();
        const renders = mockedVideoTile.mock.calls.length;

        act(() => client.setCamera('s2', {state: CameraState.Ready, track: makeTrack()}));

        expect(mockedVideoTile.mock.calls.length).toBe(renders);
    });

    test('updates when its connection state changes', () => {
        const {replaceState} = renderTile();
        expect(lastProps().connectionState).toBe('good');

        replaceState(buildState({s1: 'reconnecting'}));

        expect(lastProps().connectionState).toBe('reconnecting');
    });
});
