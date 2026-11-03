// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

const INITIAL_STATE_TIMEOUT_MS = 15000;

const waitForInitialState = (initialStateLoaded: Promise<void>, timeoutMs: number) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timed out waiting for initial state to load')), timeoutMs);
    });
    return Promise.race([initialStateLoaded, timeout]).finally(() => clearTimeout(timer));
};

// Builds the handler for link-triggered joins. It waits for the plugin's
// initial config and channel state to load first, since joinCall gates on
// that state and would otherwise run against an empty store on a cold load.
// If the state never loads, onError is called instead of waiting forever.
export const makeJoinCallFromLink = (
    initialStateLoaded: Promise<void>,
    joinCall: (channelID: string) => Promise<void>,
    onError: (err: unknown) => void,
    timeoutMs = INITIAL_STATE_TIMEOUT_MS,
) => async (channelID: string) => {
    try {
        await waitForInitialState(initialStateLoaded, timeoutMs);
        await joinCall(channelID);
    } catch (err) {
        onError(err);
    }
};
