// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// @TODO: Must move all error messages to this file

const HostRemovedYouFromCallMsg = 'host removed you from call';
export const HostRemovedYouFromCallErr = new Error(HostRemovedYouFromCallMsg);

const AudioInputPermissionsMsg = 'missing audio input permissions';
export const AudioInputPermissionsErr = new Error(AudioInputPermissionsMsg);

export const userRemovedFromChannelErr = new Error('user was removed from channel');
export const userLeftChannelErr = new Error('user has left channel');

