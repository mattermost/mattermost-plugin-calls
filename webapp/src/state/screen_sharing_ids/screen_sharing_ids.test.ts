// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {UserSessionState} from '@mattermost/calls-common/lib/types';
import {GlobalState} from '@mattermost/types/store';

import {screenSharingSessionForCurrentCall} from './selectors';

const s1 = {session_id: 's1', user_id: 'u1'} as UserSessionState;
const s2 = {session_id: 's2', user_id: 'u2'} as UserSessionState;

const stateWith = (screenSharingIDs: Record<string, string>, channelID: string) => ({
    'plugins-com.mattermost.calls': {
        screenSharingIDs,
        sessions: {channelA: {s1, s2}},
        clientStateReducer: {channelID},
    },
} as unknown as GlobalState);

describe('screenSharingSessionForCurrentCall', () => {
    test('returns the session sharing its screen in the current call', () => {
        expect(screenSharingSessionForCurrentCall(stateWith({channelA: 's2'}, 'channelA'))).toBe(s2);
    });

    test('is undefined when nobody shares a screen in the current call', () => {
        expect(screenSharingSessionForCurrentCall(stateWith({channelB: 's3'}, 'channelA'))).toBeUndefined();
    });

    test('is undefined when not in a call', () => {
        expect(screenSharingSessionForCurrentCall(stateWith({channelA: 's2'}, ''))).toBeUndefined();
    });
});
