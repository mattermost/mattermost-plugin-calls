// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {UserSessionState} from '@mattermost/calls-common/lib/types';
import {UserProfile} from '@mattermost/types/users';
import {IDMappedObjects} from '@mattermost/types/utilities';
import {isDirectChannel} from 'mattermost-redux/utils/channel_utils';
import React from 'react';
import {useSelector} from 'react-redux';
import {useDMCallingState} from 'src/components/use_dm_calling_state';
import {channelForCurrentCall} from 'src/selectors';

import {ParticipantAvatar, SpeakerAvatar} from './speaker_avatar';

interface Props {
    sessions: UserSessionState[];
    profiles: IDMappedObjects<UserProfile>;
    clientConnecting: boolean;
}

export function CallParticipantAvatar(props: Props) {
    const channel = useSelector(channelForCurrentCall);
    const {isDMCalling, dmCallee} = useDMCallingState();

    if (!channel) {
        return null;
    }

    if (isDirectChannel(channel) && (isDMCalling || props.clientConnecting)) {
        // While a DM call is ringing (callee hasn't joined yet), show the callee's avatar.
        // Once answered, and for all other calls, use the active speaker.
        return <ParticipantAvatar profile={dmCallee}/>;
    }

    // TODO: Similarly handle "Connecting" states for other call types below.
    // Other call types however do not have a ringing state and just a "Connecting" state.
    // if (isGroupChannel(channel) && props.clientConnecting) {
    // } else if ((isOpenChannel(channel) || isPrivateChannel(channel)) && props.clientConnecting) {
    // } else {
    // Return the active speaker avatar
    // }

    return (
        <SpeakerAvatar
            sessions={props.sessions}
            profiles={props.profiles}
        />
    );
}
