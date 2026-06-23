// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Channel} from '@mattermost/types/channels';
import {ActionCallEnded, ActionUnInitialized} from 'src/state/common_actions';

import {SIP_CALL_DETAILS} from './action_types';
import {SipCallDetails} from './reducer';

export const sipCallDetailsReceived = (channelID: Channel['id'], details: SipCallDetails) => ({
    type: SIP_CALL_DETAILS,
    data: {
        channelID,
        details,
    },
});
export type ActionSipCallDetailsReceived = ReturnType<typeof sipCallDetailsReceived>

export type Actions =
  | ActionUnInitialized
  | ActionCallEnded
  | ActionSipCallDetailsReceived;
