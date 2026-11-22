// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {GlobalState} from '@mattermost/types/store';
import type CallClient from 'src/clients/call';
import {initialRootState} from 'src/reducers';

import {channelIDForCurrentCall, pluginReduxStore} from './root_selectors';

const stateWith = (channelID?: string) => ({
    'plugins-com.mattermost.calls': {
        clientStateReducer: channelID === undefined ? undefined : {channelID},
    },
} as unknown as GlobalState);

describe('pluginReduxStore', () => {
    test('returns the plugin state', () => {
        const state = stateWith('channelA');

        expect(pluginReduxStore(state)).toBe(state['plugins-com.mattermost.calls' as keyof GlobalState]);
    });

    test('falls back to the initial state before the plugin registers its reducer', () => {
        expect(pluginReduxStore({} as GlobalState)).toBe(initialRootState);
    });
});

describe('channelIDForCurrentCall', () => {
    afterEach(() => {
        delete window.callsClient;
    });

    test('prefers the channel of the live calls client', () => {
        window.callsClient = {channelID: 'channelB'} as CallClient;

        expect(channelIDForCurrentCall(stateWith('channelA'))).toBe('channelB');
    });

    test('falls back to the channel in the client state', () => {
        expect(channelIDForCurrentCall(stateWith('channelA'))).toBe('channelA');
    });

    test('is empty when not in a call', () => {
        expect(channelIDForCurrentCall(stateWith())).toBe('');
    });
});
