// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {CallJobReduxState} from 'src/types/types';

import {serverDismissedAt} from './clock_skew';

describe('serverDismissedAt', () => {
    it('should return 1 when recording is not provided', () => {
        // eslint-disable-next-line no-undefined
        expect(serverDismissedAt(undefined, 0)).toBe(1);
    });

    it('should return start_at + 1 when only start_at is set', () => {
        const rec: CallJobReduxState = {init_at: 100, start_at: 1000, end_at: 0};
        expect(serverDismissedAt(rec, 0)).toBe(1001);
    });

    it('should return end_at + 1 when end_at > start_at', () => {
        const rec: CallJobReduxState = {init_at: 100, start_at: 1000, end_at: 2000};
        expect(serverDismissedAt(rec, 0)).toBe(2001);
    });

    it('should return error_at + 1 when error_at is the largest', () => {
        const rec: CallJobReduxState = {init_at: 100, start_at: 1000, end_at: 2000, error_at: 3000};
        expect(serverDismissedAt(rec, 0)).toBe(3001);
    });

    it('should return hostChangeAt + 1 when hostChangeAt is the largest', () => {
        const rec: CallJobReduxState = {init_at: 100, start_at: 1000, end_at: 0};
        expect(serverDismissedAt(rec, 5000)).toBe(5001);
    });

    it('should handle all fields set and pick the maximum', () => {
        const rec: CallJobReduxState = {init_at: 100, start_at: 1000, end_at: 2000, error_at: 1500};
        expect(serverDismissedAt(rec, 1800)).toBe(2001);
    });

    it('should return 1 when recording has all zero timestamps', () => {
        const rec: CallJobReduxState = {init_at: 0, start_at: 0, end_at: 0};
        expect(serverDismissedAt(rec, 0)).toBe(1);
    });
});
