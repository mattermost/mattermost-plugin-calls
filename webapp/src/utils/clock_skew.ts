// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {CallJobReduxState} from 'src/types/types';

// serverDismissedAt computes a dismissed-at timestamp using only
// server-side timestamps, avoiding cross-clock comparisons when the
// client and server clocks are out of sync.
//
// The returned value is guaranteed to be greater than every known
// server timestamp, so the banner's show/hide checks (which compare
// dismissedAt against start_at, end_at, hostChangeAt, etc.) work
// correctly regardless of clock skew.
//
// A new server-side event (recording restart, host change, error) will
// have a timestamp greater than this value, causing the banner to
// re-appear as expected.
export function serverDismissedAt(recording: CallJobReduxState | undefined, hostChangeAt: number): number {
    return Math.max(
        recording?.start_at || 0,
        recording?.end_at || 0,
        recording?.error_at || 0,
        hostChangeAt || 0,
    ) + 1;
}
