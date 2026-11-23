// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {act, renderHook} from '@testing-library/react';
import type {VideoTrack} from 'livekit-client';
import {CALL_EVENT} from 'src/clients/call/constants';
import {CameraState} from 'src/clients/call/types';
import {FakeCallClient, installFakeCallClient} from 'src/test_utils/fake_call_client';

import {useCameraTrack} from './use_camera_track';

const makeTrack = () => ({}) as VideoTrack;

describe('useCameraTrack', () => {
    let client: FakeCallClient;
    const originalCallsClient = window.callsClient;

    beforeEach(() => {
        client = installFakeCallClient();
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
