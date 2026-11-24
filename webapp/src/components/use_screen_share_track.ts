// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {GlobalState} from '@mattermost/types/store';
import {useEffect, useState} from 'react';
import {useStore} from 'react-redux';
import CallClient, {CALL_EVENT} from 'src/clients/call';
import type {ScreenSharingSession} from 'src/clients/call/types';
import {sessionsInCurrentCallMap} from 'src/state/session/selectors';
import {getCallsClient} from 'src/utils';

// SCREEN_SHARING_CHANGED only fires on change, so a component mounting mid-share has to read the
// share already in progress, which may be our own.
const readScreenSharingSession = (client: CallClient | undefined, state: GlobalState): ScreenSharingSession | null => {
    const sessionID = client?.getCurrentScreenSharingSessionID();
    if (!client || !sessionID) {
        return null;
    }

    const isLocal = sessionID === client.getSessionID();
    return {
        sessionID,
        userID: sessionsInCurrentCallMap(state)?.[sessionID]?.user_id ?? '',
        isLocal,
        track: isLocal ? client.getLocalScreenTrack() : client.getRemoteScreenTrack(),
    };
};

const keepIfSame = (next: ScreenSharingSession | null) => (prev: ScreenSharingSession | null) => {
    if (prev === next) {
        return prev;
    }
    if (prev && next && prev.sessionID === next.sessionID && prev.userID === next.userID && prev.isLocal === next.isLocal && prev.track === next.track) {
        return prev;
    }
    return next;
};

/** Returns the screen share being presented in the current call, local or remote, or null. */
export function useScreenShareTrack(): ScreenSharingSession | null {
    const store = useStore<GlobalState>();
    const [session, setSession] = useState<ScreenSharingSession | null>(() => readScreenSharingSession(getCallsClient(), store.getState()));

    useEffect(() => {
        const client = getCallsClient();

        // Catches a share that changed between the first render and subscribing.
        setSession(keepIfSame(readScreenSharingSession(client, store.getState())));

        if (!client) {
            return undefined;
        }

        const onScreenSharingChanged = (next: ScreenSharingSession | null) => {
            setSession(keepIfSame(next));
        };
        client.on(CALL_EVENT.SCREEN_SHARING_CHANGED, onScreenSharingChanged);
        return () => {
            client.off(CALL_EVENT.SCREEN_SHARING_CHANGED, onScreenSharingChanged);
        };
    }, [store]);

    return session;
}
