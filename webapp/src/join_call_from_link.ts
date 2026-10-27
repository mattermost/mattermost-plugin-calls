// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Builds the handler for link-triggered joins. It waits for the plugin's
// initial config and channel state to load first, since joinCall gates on
// that state and would otherwise run against an empty store on a cold load.
export const makeJoinCallFromLink = (
    initialStateLoaded: Promise<void>,
    joinCall: (channelID: string) => Promise<void>,
    onError: (err: unknown) => void,
) => async (channelID: string) => {
    try {
        await initialStateLoaded;
        await joinCall(channelID);
    } catch (err) {
        onError(err);
    }
};
