// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
export const CallsConfigDefault = {
    ICEServers: [],
    ICEServersConfigs: [],
    DefaultEnabled: false,
    MaxCallParticipants: 0,
    NeedsTURNCredentials: false,
    AllowScreenSharing: true,
    EnableRecordings: false,
    MaxRecordingDuration: 60,
    sku_short_name: '',
};
export const CallsUserPreferencesDefault = {
    joinSoundParticipantsThreshold: 8,
};
export var CallAlertType;
(function (CallAlertType) {
    CallAlertType["Error"] = "error";
    CallAlertType["Warning"] = "warning";
})(CallAlertType || (CallAlertType = {}));
export const CallAlertStatesDefault = {
    missingAudioInput: {
        active: false,
        show: false,
    },
    missingAudioInputPermissions: {
        active: false,
        show: false,
    },
    missingScreenPermissions: {
        active: false,
        show: false,
    },
};
