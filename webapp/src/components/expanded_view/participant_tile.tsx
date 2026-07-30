// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {UserSessionState} from '@mattermost/calls-common/lib/types';
import {UserProfile} from '@mattermost/types/users';
import {IDMappedObjects} from '@mattermost/types/utilities';
import {Client4} from 'mattermost-redux/client';
import React from 'react';
import {useIntl} from 'react-intl';
import {getUserDisplayName} from 'src/utils';

import ParticipantCell, {TileSize} from './participant_cell';

interface Props {
    session: UserSessionState;
    profiles: IDMappedObjects<UserProfile>;
    tileSize: TileSize;
    profileImages?: Record<string, string>;
    currentSessionID?: string;
    currentUserID?: UserProfile['id'];
    callHostID: UserProfile['id'];
    callID: string;
    onParticipantRemove?: (sessionID: string, userID: string) => void,
}

export function ParticipantTile(props: Props) {
    const {formatMessage} = useIntl();

    if (!props.profiles) {
        return null;
    }

    const isMuted = !props.session.unmuted;
    const isSpeaking = Boolean(props.session.voice);
    const isHandRaised = Boolean(props.session.raised_hand > 0);
    const reaction = props.session?.reaction;
    const profile = props.profiles[props.session.user_id];

    if (!profile) {
        return null;
    }

    // The recorder passes profileImages and fetches avatars through the bot endpoint, which Client4
    // has no credentials for — so a missing blob has to stay undefined and hide the tile rather than
    // fall back to a URL that would 401.
    const pictureURL = props.profileImages ? props.profileImages[profile.id] : Client4.getProfilePictureUrl(profile.id, profile.last_picture_update);
    const isYou = props.session.session_id === props.currentSessionID;
    const isHost = profile.id === props.callHostID;
    const iAmHost = props.currentUserID ? props.currentUserID === props.callHostID : false;
    const name = getUserDisplayName(profile) + (isYou ? ` ${formatMessage({defaultMessage: '(you)'})}` : '');

    function handleHostRemoveParticipant() {
        if (props.onParticipantRemove) {
            props.onParticipantRemove(props.session.session_id, props.session.user_id);
        }
    }

    return (
        <ParticipantCell
            key={props.session.session_id}
            name={name}
            size={props.tileSize}
            pictureURL={pictureURL}
            isMuted={isMuted}
            isSpeaking={isSpeaking}
            isHandRaised={isHandRaised}
            reaction={reaction}
            isYou={isYou}
            isHost={isHost}
            iAmHost={iAmHost}
            callID={props.callID}
            userID={props.session.user_id}
            sessionID={props.session.session_id}
            isSharingScreen={false}
            onRemove={handleHostRemoveParticipant}
        />
    );
}
