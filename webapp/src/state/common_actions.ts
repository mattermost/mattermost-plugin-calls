// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Channel} from '@mattermost/types/channels';

import {CALL_ENDED, UN_INITIALIZED} from './common_action_types';

export const unInitialized = () => ({
    type: UN_INITIALIZED,
});
export type ActionUnInitialized = ReturnType<typeof unInitialized>

export const callEnded = (channelID: Channel['id'], callID: string) => ({
    type: CALL_ENDED,
    data: {
        channelID,
        callID,
    },
});
export type ActionCallEnded = ReturnType<typeof callEnded>