// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {LOWER_HAND_ON_UNMUTE_DELAY_MS} from 'src/constants';

export type LowerHandOnUnmuteDeps = {
    getOwnSessionID: () => string | null | undefined;
    isEnabled: () => boolean;
    isOwnHandRaised: () => boolean;
    lowerHand: () => void;
    delayMs?: number;
};

// Lowers the local user's raised hand once they've stayed unmuted for
// long enough (user setting). Mute/unmute events fire for every participant,
// so callers pass the event's session ID and we only react to our own.
export function createLowerHandOnUnmute(deps: LowerHandOnUnmuteDeps) {
    const delayMs = deps.delayMs ?? LOWER_HAND_ON_UNMUTE_DELAY_MS;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const clear = () => {
        if (timeout) {
            clearTimeout(timeout);
            timeout = null;
        }
    };

    const isOwnSession = (sessionID: string) => Boolean(sessionID) && sessionID === deps.getOwnSessionID();

    return {
        onMute(sessionID: string) {
            if (isOwnSession(sessionID)) {
                clear();
            }
        },
        onUnmute(sessionID: string) {
            if (!isOwnSession(sessionID)) {
                return;
            }

            clear();

            // Only act on a hand that was already raised when unmuting, so that
            // raising it right after unmuting isn't immediately undone.
            if (!deps.isEnabled() || !deps.isOwnHandRaised()) {
                return;
            }

            timeout = setTimeout(() => {
                timeout = null;
                if (deps.isOwnHandRaised()) {
                    deps.lowerHand();
                }
            }, delayMs);
        },
        dispose: clear,
    };
}
