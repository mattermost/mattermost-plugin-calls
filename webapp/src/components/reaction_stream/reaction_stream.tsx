// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import styled, {CSSProperties} from 'styled-components';
import {useSelector} from 'react-redux';

import {UserProfile} from '@mattermost/types/lib/users';

import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';
import {getChannel} from 'mattermost-redux/selectors/entities/channels';

import {GlobalState} from '@mattermost/types/lib/store';

import {connectedChannelID, voiceChannelScreenSharingID, voiceConnectedProfiles, voiceReactions, voiceUsersStatuses} from 'src/selectors';

import {Emoji} from '../emoji/emoji';
import {UserState} from 'src/types/types';
import {getUserDisplayName} from 'src/utils';
import {alphaSortProfiles, stateSortProfiles} from '../../utils';

interface streamListStyleProps {
    left?: string;
}

type Props = {
    style?: streamListStyleProps;
};

const ReactionStreamList = styled.div<streamListStyleProps>`
    position: absolute;
    align-self: flex-end;
    height: 75vh;
    display: flex;
    flex-direction: column-reverse;
    margin-left: 10px;
    -webkit-mask: linear-gradient(#0000, #000);
    mask: linear-gradient(#0000, #0003, #000f);
    left: ${(props) => (props.left ? props.left : '')}
`;

interface chipProps {
    highlight?: boolean;
}

const ReactionChip = styled.div<chipProps>`
    display: flex;
    flex-direction: row;
    align-items: flex-end;
    padding: 2px 10px;
    gap: 2px;
    height: 23px;
    background: rgba(221, 223, 228, 0.08);
    border-radius: 12px;
    margin: 4px 0;
    width: fit-content;

    ${(props) => props.highlight && `
        background: #FFBC1F;
        color: #090A0B;
  `}
`;

type VoiceUserStatuses = {
    [key: string]: UserState,
};

// add a list of reactions, on top of that add the hands up as the top element
export const ReactionStream = (props: Props) => {
    const vReactions = useSelector(voiceReactions);
    const currentUserID = useSelector(getCurrentUserId);

    const statuses = useSelector(voiceUsersStatuses) as VoiceUserStatuses;
    const vConnectedProfiles = useSelector(voiceConnectedProfiles);

    const cChannelID = useSelector(connectedChannelID);
    const channel = useSelector((state: GlobalState) => getChannel(state, cChannelID));

    const screenSharingID = useSelector((state: GlobalState) => voiceChannelScreenSharingID(state, channel?.id)) || '';

    const sortedProfiles = (profiles: UserProfile[], sta: {[key: string]: UserState}) => {
        return [...profiles].sort(alphaSortProfiles(profiles)).sort(stateSortProfiles(profiles, sta, screenSharingID));
    };
    const profiles = sortedProfiles(vConnectedProfiles, statuses);

    // building the list here causes a bug tht if a user leaves and recently reacted it will show as blank
    const profileMap: {[key: string]: UserProfile;} = {};
    profiles.forEach((profile) => {
        profileMap[profile.id] = profile;
    });
    const handsup: string[] = [];
    for (const [id, member] of Object.entries(statuses)) {
        if (member.raised_hand) {
            handsup.push(id);
        }
    }

    const reversed = [...vReactions];

    reversed.reverse();
    const reactions = reversed.map((reaction) => {
        // emojis should be a separate component that is reused both here and in the extended view
        // getEmojiURL should be memoized as people tend to react similarly and this would speed up the process.
        const emoji = (<Emoji emoji={reaction.emoji}/>);
        const user = reaction.user_id === currentUserID ? 'You' : getUserDisplayName(profileMap[reaction.user_id]) || 'Someone';
        return (
            <ReactionChip key={reaction.timestamp + reaction.user_id}>
                <span>{emoji}</span>
                &nbsp;
                <span>{user}</span>
            </ReactionChip>
        );
    });

    // add hands up
    let elements = [];
    const getName = (user_id: string) => {
        return user_id === currentUserID ? 'You' : getUserDisplayName(profileMap[user_id]);
    };
    let participants: string;
    if (handsup?.length) {
        switch (handsup?.length) {
        case 1:
            participants = `${getName(handsup[0])}`;
            break;
        case 2:
            participants = `${getName(handsup[0])} & ${getName(handsup[1])}`;
            break;
        case 3:
            participants = `${getName(handsup[0])}, ${getName(handsup[1])} & ${getName(handsup[2])}`;
            break;
        default:
            participants = `${getName(handsup[0])}, ${getName(handsup[1])} & ${handsup?.length - 2} others`;
            break;
        }
        const handsupElement = (<Emoji emoji={{name: 'hand', skin: '', unified: '270B'}}/>);

        elements.push(
            <ReactionChip
                key={'hands'}
                highlight={true}
            >
                <span>{handsupElement}</span>
                &nbsp;
                <span>{`${participants} raised a hand`}</span>
            </ReactionChip>);
    }

    elements = [...elements, ...reactions];

    return (
        <ReactionStreamList left={props?.style?.left}>
            {elements}
        </ReactionStreamList>
    );
};
