// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// @TODO: Must move all error messages to this file

const HostRemovedYouFromCallMsg = 'host removed you from call';
export const HostRemovedYouFromCallErr = new Error(HostRemovedYouFromCallMsg);

const AudioInputPermissionsMsg = 'missing audio input permissions';
export const AudioInputPermissionsErr = new Error(AudioInputPermissionsMsg);

export const VideoInputPermissionsError = new Error('missing video input permissions');

export const userRemovedFromChannelErr = new Error('user was removed from channel');
export const userLeftChannelErr = new Error('user has left channel');

// Inherited from the pre-LiveKit client, which is where these were raised. The
// modal still maps them to messages; nothing produces them any more.
export const rtcPeerErr = new Error('rtc peer error');
export const rtcPeerTimeoutErr = new Error('timed out waiting for rtc connection');
export const rtcPeerCloseErr = new Error('rtc peer close');
export const insecureContextErr = new Error('insecure context');

