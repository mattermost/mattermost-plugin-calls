"use strict";
// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
Object.defineProperty(exports, "__esModule", { value: true });
exports.CallAlertStatesDefault = exports.CallAlertType = exports.CallsUserPreferencesDefault = exports.CallsConfigDefault = void 0;
exports.CallsConfigDefault = {
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
exports.CallsUserPreferencesDefault = {
    joinSoundParticipantsThreshold: 8,
};
var CallAlertType;
(function (CallAlertType) {
    CallAlertType["Error"] = "error";
    CallAlertType["Warning"] = "warning";
})(CallAlertType = exports.CallAlertType || (exports.CallAlertType = {}));
exports.CallAlertStatesDefault = {
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
