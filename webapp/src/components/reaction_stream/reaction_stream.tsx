// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import styled, {css} from 'styled-components';
import {useSelector} from 'react-redux';

import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';

import {
    idToProfileInCurrentChannel,
    voiceReactions,
    voiceUsersStatuses,
} from 'src/selectors';
import {Emoji} from 'src/components/emoji/emoji';
import {getUserDisplayName} from 'src/utils';

interface Props {
    forceLeft?: boolean;
}

// add a list of reactions, on top of that add the hands up as the top element
export const ReactionStream = ({forceLeft}: Props) => {
    const vReactions = useSelector(voiceReactions);
    const currentUserID = useSelector(getCurrentUserId);

    const statuses = useSelector(voiceUsersStatuses);
    const profileMap = useSelector(idToProfileInCurrentChannel);

    const handsup = Object.keys(statuses)
        .flatMap((id) => (statuses[id]?.raised_hand ? [statuses[id]] : []))
        .sort((a, b) => a.raised_hand - b.raised_hand)
        .map((u) => u.id);

    const reversed = [...vReactions].reverse();
    const reactions = reversed.map((reaction) => {
        const emoji = <Emoji emoji={reaction.emoji}/>;
        const user = reaction.user_id === currentUserID ? 'You' : reaction.displayName || 'Someone';
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
        <ReactionStreamList forceLeft={forceLeft}>
            {elements}
        </ReactionStreamList>
    );
};

interface streamListStyleProps {
    forceLeft?: boolean;
}

const ReactionStreamList = styled.div<streamListStyleProps>`
    position: absolute;
    align-self: flex-end;
    height: 75vh;
    display: flex;
    flex-direction: column-reverse;
    margin-left: 10px;
    -webkit-mask: -webkit-gradient(#0000, #000);
    mask: linear-gradient(#0000, #0003, #000f);
    ${(props) => props.forceLeft && css`
        left: 0;
    `}
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
    color: black;
    background: rgba(221, 223, 228, 0.48);
    border-radius: 12px;
    margin: 4px 0;
    width: fit-content;

    ${(props) => props.highlight && `
        background: #FFFFFF;
        color: #090A0B;
  `}
`;
