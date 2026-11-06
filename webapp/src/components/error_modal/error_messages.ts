// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// @TODO: Must move all error messages to this file

const HostRemovedYouFromCallMsg = 'host removed you from call';
export const HostRemovedYouFromCallErr = new Error(HostRemovedYouFromCallMsg);

const AudioInputPermissionsMsg = 'missing audio input permissions';
export const AudioInputPermissionsErr = new Error(AudioInputPermissionsMsg);

export const userRemovedFromChannelErr = new Error('user was removed from channel');
export const userLeftChannelErr = new Error('user has left channel');

export const insecureContextErr = new Error('insecure context');

// Text the join API (POST livekit-token) returns when it refuses a join, from
// validateCallJoin in server/api.go and userCanStartOrJoin/addUserSession in
// server/session.go. The server sends untranslated strings, so the modal maps these
// to localized copy. Keep in sync with the server; unmapped text falls back to the
// generic modal.
export const joinDeniedMsgs = {
    forbidden: 'forbidden',
    insufficientPermissions: 'insufficient permissions',
    channelDisabled: 'calls are disabled in the channel',
    atCapacity: 'user cannot join because of limits',
    groupCallsUnlicensed: 'unlicensed servers only allow calls in DMs',
    callEnded: 'call has ended',
    channelArchived: 'cannot join call in archived channel',
} as const;
