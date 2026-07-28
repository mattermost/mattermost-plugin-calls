// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {UserSessionState} from '@mattermost/calls-common/lib/types';
import {UserProfile} from '@mattermost/types/users';
import {IDMappedObjects} from '@mattermost/types/utilities';
import React from 'react';
import {useIntl} from 'react-intl';
import {getUserDisplayName, untranslatable} from 'src/utils';

import {useCallingStateForDMCall} from './use_calling_state_for_dm_call';

interface Props {
    sessions: UserSessionState[];
    profiles: IDMappedObjects<UserProfile>;
}

export function SpeakingIndicator(props: Props) {
    const {formatMessage} = useIntl();

    const {isInCallingStateForDMChannelCall, otherDMUser} = useCallingStateForDMCall();
    if (isInCallingStateForDMChannelCall) {
        return (
            <div className='speakingIndicatorContainer'>
                <span>
                    {getUserDisplayName(otherDMUser)}
                </span>
            </div>
        );
    }

    let speakingProfile;
    for (let i = 0; i < props.sessions.length; i++) {
        const session = props.sessions[i];
        const profile = props.profiles[session.user_id];
        if (session.voice && profile) {
            speakingProfile = profile;
            break;
        }
    }

    if (speakingProfile) {
        return (
            <div className='speakingIndicatorContainer'>
                <span>
                    {getUserDisplayName(speakingProfile)}
                    <span
                        className='isTalkingText'
                    >
                        {untranslatable(' ')}{formatMessage({defaultMessage: 'is talking…'})}
                    </span>
                </span>
            </div>
        );
    }

    return (
        <div className='speakingIndicatorContainer'>
            <span className='noOneSpeakingText'>
                {formatMessage({defaultMessage: 'No one is talking…'})}
            </span>
        </div>
    );
}