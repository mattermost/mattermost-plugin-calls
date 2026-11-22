// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {UserSessionState} from '@mattermost/calls-common/lib/types';
import {Channel} from '@mattermost/types/channels';
import {UserProfile} from '@mattermost/types/users';
import {CameraState} from 'src/clients/call/types';
import {
    ActionCallEnded,
    ActionLocalSessionClose,
    ActionUnInitialized,
    ActionUserLeft,
} from 'src/state/session/actions';

import {USER_CAMERA_OFF, USER_CAMERA_ON} from './action_types';

export const userCameraOn = (channelID: Channel['id'], sessionID: UserSessionState['session_id'], userID: UserProfile['id']) => ({
    type: USER_CAMERA_ON,
    data: {
        channelID,
        session_id: sessionID,
        userID,
    },
});
export type ActionUserCameraOn = ReturnType<typeof userCameraOn>

export const userCameraOff = (channelID: Channel['id'], sessionID: UserSessionState['session_id'], userID: UserProfile['id']) => ({
    type: USER_CAMERA_OFF,
    data: {
        channelID,
        session_id: sessionID,
        userID,
    },
});
export type ActionUserCameraOff = ReturnType<typeof userCameraOff>

export const userCameraChanged = (channelID: Channel['id'], sessionID: UserSessionState['session_id'], userID: UserProfile['id'], cameraState: CameraState) => (
    cameraState === CameraState.Off ? userCameraOff(channelID, sessionID, userID) : userCameraOn(channelID, sessionID, userID)
);

export type Actions =
  | ActionUnInitialized
  | ActionUserLeft
  | ActionCallEnded
  | ActionLocalSessionClose
  | ActionUserCameraOn
  | ActionUserCameraOff;
