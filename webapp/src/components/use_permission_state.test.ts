// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {act, renderHook, waitFor} from '@testing-library/react';

import {usePermissionState} from './use_permission_state';

describe('usePermissionState', () => {
    const originalPermissions = Object.getOwnPropertyDescriptor(navigator, 'permissions');

    const mockPermissions = (query: jest.Mock) => {
        Object.defineProperty(navigator, 'permissions', {value: {query}, configurable: true});
    };

    const makeStatus = (state: PermissionState) => {
        const listeners = new Set<() => void>();
        return {
            state,
            addEventListener: jest.fn((_: string, cb: () => void) => listeners.add(cb)),
            removeEventListener: jest.fn((_: string, cb: () => void) => listeners.delete(cb)),
            change(next: PermissionState) {
                this.state = next;
                listeners.forEach((cb) => cb());
            },
        };
    };

    afterEach(() => {
        if (originalPermissions) {
            Object.defineProperty(navigator, 'permissions', originalPermissions);
        } else {
            delete (navigator as {permissions?: unknown}).permissions;
        }
    });

    test('is null where the browser has no permissions API', () => {
        delete (navigator as {permissions?: unknown}).permissions;

        const {result} = renderHook(() => usePermissionState('camera'));

        expect(result.current).toBeNull();
    });

    test('is null where the browser cannot query this permission', async () => {
        const query = jest.fn().mockRejectedValue(new TypeError('unsupported'));
        mockPermissions(query);

        const {result} = renderHook(() => usePermissionState('camera'));

        await waitFor(() => expect(query).toHaveBeenCalledWith({name: 'camera'}));
        expect(result.current).toBeNull();
    });

    test('reports the permission and follows changes until unmounted', async () => {
        const status = makeStatus('prompt');
        mockPermissions(jest.fn().mockResolvedValue(status));

        const {result, unmount} = renderHook(() => usePermissionState('camera'));
        await waitFor(() => expect(result.current).toBe('prompt'));

        act(() => status.change('denied'));
        expect(result.current).toBe('denied');

        unmount();
        expect(status.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    });

    test('ignores a result that arrives after unmounting', async () => {
        let resolve: (value: unknown) => void = () => {};
        const status = makeStatus('granted');
        mockPermissions(jest.fn(() => new Promise((r) => {
            resolve = r;
        })));

        const {unmount} = renderHook(() => usePermissionState('camera'));
        unmount();
        await act(async () => resolve(status));

        expect(status.addEventListener).not.toHaveBeenCalled();
    });
});
