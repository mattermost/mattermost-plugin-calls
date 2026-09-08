// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {UserSessionState} from '@mattermost/calls-common/lib/types';
import {UserProfile} from '@mattermost/types/users';
import {IDMappedObjects} from '@mattermost/types/utilities';
import React from 'react';
import {useIntl} from 'react-intl';
import {getUserDisplayName, untranslatable} from 'src/utils';

import {getActiveSpeakerProfile} from './active_speaker';

interface ParticipantNameProps {
    profile?: UserProfile | null;
    shouldShowIsTalkingText?: boolean;
}

export function ParticipantName(props: ParticipantNameProps) {
    const {formatMessage} = useIntl();

    if (props.profile) {
        return (
            <div className='participantNameContainer'>
                <span>
                    {getUserDisplayName(props.profile)}
                    {props.shouldShowIsTalkingText && (
                        <span className='nonNameText'>
                            {untranslatable(' ')}{formatMessage({defaultMessage: 'is talking…'})}
                        </span>
                    )}
                </span>
            </div>
        );
    }

    return (
        <div className='participantNameContainer'>
            <span className='nonNameText'>
                {formatMessage({defaultMessage: 'No one is talking…'})}
            </span>
        </div>
    );
}

interface SpeakerNameProps {
    sessions: UserSessionState[];
    profiles: IDMappedObjects<UserProfile>;
}

export function SpeakerName(props: SpeakerNameProps) {
    const activeSpeakerProfile = getActiveSpeakerProfile(props.sessions, props.profiles);
    return (
        <ParticipantName
            profile={activeSpeakerProfile}
            shouldShowIsTalkingText={true}
        />
    );
}
