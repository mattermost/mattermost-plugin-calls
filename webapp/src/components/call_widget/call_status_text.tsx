// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {UserSessionState} from '@mattermost/calls-common/lib/types';
import {UserProfile} from '@mattermost/types/users';
import {IDMappedObjects} from '@mattermost/types/utilities';
import React from 'react';

import {ParticipantName, SpeakerName} from './speaker_name';
import {useDMCallingState} from './use_dm_calling_state';

interface Props {
    sessions: UserSessionState[];
    profiles: IDMappedObjects<UserProfile>;
}

export function CallStatusText(props: Props) {
    const {isDMCalling, dmCallee} = useDMCallingState();

    // While a DM call is ringing (callee hasn't joined yet), show the callee's name.
    // Once answered, and for all other calls, use the active speaker.
    if (isDMCalling) {
        return <ParticipantName profile={dmCallee}/>;
    }

    return (
        <SpeakerName
            sessions={props.sessions}
            profiles={props.profiles}
        />
    );
}
