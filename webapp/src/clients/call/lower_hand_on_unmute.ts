// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {LOWER_HAND_ON_UNMUTE_DELAY_MS} from 'src/constants';

export type LowerHandOnUnmuteDeps = {
    isEnabled: () => boolean;

    // Timestamp of the local user's current raised hand, or 0 when not raised.
    ownHandRaisedAt: () => number;
    lowerHand: () => void;
    delayMs?: number;
};

// Lowers the local user's raised hand once they've stayed unmuted for
// long enough (user setting). Callers must only report the local
// participant's own mute/unmute transitions, and must call cancel when the
// hand is lowered by other means.
export function createLowerHandOnUnmute(deps: LowerHandOnUnmuteDeps) {
    const delayMs = deps.delayMs ?? LOWER_HAND_ON_UNMUTE_DELAY_MS;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const clear = () => {
        if (timeout) {
            clearTimeout(timeout);
            timeout = null;
        }
    };

    return {
        onMute: clear,
        cancel: clear,
        onUnmute() {
            clear();

            // Only act on a hand that was already raised when unmuting, so that
            // raising it right after unmuting isn't immediately undone.
            const raisedAt = deps.ownHandRaisedAt();
            if (!deps.isEnabled() || raisedAt <= 0) {
                return;
            }

            timeout = setTimeout(() => {
                timeout = null;

                // The setting may have been turned off during the delay, and the
                // hand may have been lowered and raised again (a new timestamp).
                if (deps.isEnabled() && deps.ownHandRaisedAt() === raisedAt) {
                    deps.lowerHand();
                }
            }, delayMs);
        },
        dispose: clear,
    };
}
