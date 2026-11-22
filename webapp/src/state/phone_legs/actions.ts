// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Channel} from '@mattermost/types/channels';
import {ActionCallEnded, ActionUnInitialized} from 'src/state/session/actions';
import {SIPCallStatus} from 'src/types/types';

import {PHONE_LEG_STATUS_CHANGED} from './action_types';

export const phoneLegStatusChanged = (channelID: Channel['id'], status: SIPCallStatus, now = Date.now()) => ({
    type: PHONE_LEG_STATUS_CHANGED,
    data: {
        channelID,
        status,
        now,
    },
});
export type ActionPhoneLegStatusChanged = ReturnType<typeof phoneLegStatusChanged>

export type Actions =
  | ActionUnInitialized
  | ActionCallEnded
  | ActionPhoneLegStatusChanged;
