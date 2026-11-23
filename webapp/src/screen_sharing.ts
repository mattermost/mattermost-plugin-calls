// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {ScreenSharingSession} from 'src/clients/call/types';
import {screenSharingCleared, userScreenShared} from 'src/state/screen_sharing_ids/actions';

type StoreAPI = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dispatch: (action: any) => any;
}

// Mirrors the call client's derived screen sharer (CALL_EVENT.SCREEN_SHARING_CHANGED)
// into Redux. A null session means nobody is sharing and clears unconditionally:
// the standalone surfaces (Desktop widget, recorder) have no websocket
// user_screen_off to fall back on, and the session id guard that protects against
// late websocket events does not apply to a freshly derived sharer.
export function applyScreenSharingChanged(store: StoreAPI, channelID: string, session: ScreenSharingSession | null) {
    if (session) {
        store.dispatch(userScreenShared(channelID, session.sessionID, session.userID));
    } else {
        store.dispatch(screenSharingCleared(channelID));
    }
}
