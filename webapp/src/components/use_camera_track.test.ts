// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {act, renderHook} from '@testing-library/react';
import {EventEmitter} from 'events';
import type {VideoTrack} from 'livekit-client';
import type CallClient from 'src/clients/call';
import {CALL_EVENT} from 'src/clients/call/constants';
import {CameraState, type CameraTrack} from 'src/clients/call/types';

import {useCameraTrack} from './use_camera_track';

const makeTrack = () => ({}) as VideoTrack;

class FakeClient extends EventEmitter {
    cameras = new Map<string, CameraTrack>();
    getCameraTrack = jest.fn((sessionID: string) => this.cameras.get(sessionID) ?? {state: CameraState.Off, track: null});

    setCamera(sessionID: string, camera: CameraTrack) {
        this.cameras.set(sessionID, camera);
        this.emit(CALL_EVENT.CAMERA_CHANGED, sessionID, `user-${sessionID}`, camera.state);
    }
}

describe('useCameraTrack', () => {
    let client: FakeClient;
    const originalCallsClient = window.callsClient;

    beforeEach(() => {
        client = new FakeClient();
        window.callsClient = client as unknown as CallClient;
    });

    afterEach(() => {
        window.callsClient = originalCallsClient;
    });

    test('reads the initial track', () => {
        const track = makeTrack();
        client.cameras.set('s1', {state: CameraState.Ready, track});

        const {result} = renderHook(() => useCameraTrack('s1'));

        expect(result.current).toEqual({state: CameraState.Ready, track});
    });

    test('is off without a call client', () => {
        window.callsClient = undefined;

        const {result} = renderHook(() => useCameraTrack('s1'));

        expect(result.current).toEqual({state: CameraState.Off, track: null});
    });

    test('follows CAMERA_CHANGED for its own session from loading to ready to off', () => {
        const {result} = renderHook(() => useCameraTrack('s1'));
        expect(result.current.state).toBe(CameraState.Off);

        act(() => client.setCamera('s1', {state: CameraState.Loading, track: null}));
        expect(result.current).toEqual({state: CameraState.Loading, track: null});

        const track = makeTrack();
        act(() => client.setCamera('s1', {state: CameraState.Ready, track}));
        expect(result.current).toEqual({state: CameraState.Ready, track});

        act(() => client.setCamera('s1', {state: CameraState.Off, track: null}));
        expect(result.current).toEqual({state: CameraState.Off, track: null});
    });

    test('ignores other sessions and does not re-render for them', () => {
        let renders = 0;
        const {result} = renderHook(() => {
            renders++;
            return useCameraTrack('s1');
        });
        const rendersBefore = renders;
        const before = result.current;

        act(() => client.setCamera('s2', {state: CameraState.Ready, track: makeTrack()}));

        expect(result.current).toBe(before);
        expect(renders).toBe(rendersBefore);
    });

    test('keeps the same object when an event reports no change', () => {
        const track = makeTrack();
        client.cameras.set('s1', {state: CameraState.Ready, track});
        const {result} = renderHook(() => useCameraTrack('s1'));
        const before = result.current;

        act(() => client.setCamera('s1', {state: CameraState.Ready, track}));

        expect(result.current).toBe(before);
    });

    test('switches to the new session when sessionID changes', () => {
        const track = makeTrack();
        client.cameras.set('s2', {state: CameraState.Ready, track});
        const {result, rerender} = renderHook(({sessionID}) => useCameraTrack(sessionID), {initialProps: {sessionID: 's1'}});
        expect(result.current.state).toBe(CameraState.Off);

        rerender({sessionID: 's2'});

        expect(result.current).toEqual({state: CameraState.Ready, track});
        expect(client.listenerCount(CALL_EVENT.CAMERA_CHANGED)).toBe(1);
    });

    test('removes its listener on unmount', () => {
        const {unmount} = renderHook(() => useCameraTrack('s1'));
        expect(client.listenerCount(CALL_EVENT.CAMERA_CHANGED)).toBe(1);

        unmount();

        expect(client.listenerCount(CALL_EVENT.CAMERA_CHANGED)).toBe(0);
    });
});
