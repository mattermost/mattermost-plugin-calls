// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Channel} from '@mattermost/types/channels';
import {CameraError} from 'src/clients/call/types';
import {CallAlertStatesDefault} from 'src/types/types';
import {isDMChannel} from 'src/utils';

type VideoModeInput = {
    dmVideoEnabled: boolean;
    channel?: Channel;
    isPhoneCall: boolean;
    clientConnecting: boolean;
    canPublishCamera: boolean;
};

// Before connecting, the client doesn't know its publish permissions yet, so only the settings decide.
export function isVideoMode({dmVideoEnabled, channel, isPhoneCall, clientConnecting, canPublishCamera}: VideoModeInput) {
    if (!dmVideoEnabled || !isDMChannel(channel) || isPhoneCall) {
        return false;
    }
    return clientConnecting || canPublishCamera;
}

type ShowCamerasInput = {
    videoMode: boolean;
    isDMCalling: boolean;
    clientConnecting: boolean;
    isCameraOn: boolean;
    isOtherCameraOn: boolean;
};

// While ringing only our own camera can show. Once answered, either person's camera does.
export function showCameras({videoMode, isDMCalling, clientConnecting, isCameraOn, isOtherCameraOn}: ShowCamerasInput) {
    if (!videoMode) {
        return false;
    }
    if (isDMCalling) {
        return isCameraOn;
    }
    return !clientConnecting && (isCameraOn || isOtherCameraOn);
}

export type CallAlertID = keyof typeof CallAlertStatesDefault;

export const CAMERA_ERROR_ALERT_IDS: Record<CameraError, CallAlertID> = {
    [CameraError.PermissionDenied]: 'cameraPermissionDenied',
    [CameraError.NotFound]: 'cameraNotFound',
    [CameraError.DeviceInUse]: 'cameraInUse',
    [CameraError.Disconnected]: 'cameraDisconnected',
    [CameraError.Other]: 'cameraFailed',
};

export const CAMERA_ALERT_IDS = Object.values(CAMERA_ERROR_ALERT_IDS);
