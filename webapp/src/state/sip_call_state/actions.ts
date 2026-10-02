// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Channel} from '@mattermost/types/channels';
import {ActionCallEnded, ActionUnInitialized} from 'src/state/session/actions';
import {SIPCallStatus} from 'src/types/types';

import {SIP_CALL_STATUS_CHANGED} from './action_types';

export const sipCallStatusChanged = (channelID: Channel['id'], status: SIPCallStatus, now = Date.now()) => ({
    type: SIP_CALL_STATUS_CHANGED,
    data: {
        channelID,
        status,
        now,
    },
});
export type ActionSIPCallStatusChanged = ReturnType<typeof sipCallStatusChanged>

export type Actions =
  | ActionUnInitialized
  | ActionCallEnded
  | ActionSIPCallStatusChanged;
