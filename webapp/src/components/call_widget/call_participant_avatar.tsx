// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {UserSessionState} from '@mattermost/calls-common/lib/types';
import {UserProfile} from '@mattermost/types/users';
import {IDMappedObjects} from '@mattermost/types/utilities';
import React from 'react';

import {ParticipantAvatar, SpeakerAvatar} from './speaker_avatar';
import {useDMCallingState} from './use_calling_state_for_dm_call';

interface Props {
    sessions: UserSessionState[];
    profiles: IDMappedObjects<UserProfile>;
}

export function CallParticipantAvatar(props: Props) {
    const {isDMCalling, dmCallee} = useDMCallingState();

    // While a DM call is ringing (callee hasn't joined yet), show the callee's avatar.
    // Once answered, and for all other calls, use the active speaker.
    if (isDMCalling) {
        return <ParticipantAvatar profile={dmCallee}/>;
    }

    return (
        <SpeakerAvatar
            sessions={props.sessions}
            profiles={props.profiles}
        />
    );
}
