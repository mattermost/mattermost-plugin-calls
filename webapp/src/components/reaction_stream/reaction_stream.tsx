// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import styled from 'styled-components';

import {UserProfile} from '@mattermost/types/lib/users';

import {Emoji} from '../emoji/emoji';
import {ReactionWithUser} from 'src/types/types';
import {getUserDisplayName} from 'src/utils';

type Props = {
    reactions: ReactionWithUser[],
    currentUserID: string,
    profiles: {[key: string]: UserProfile;},
    handsup: string[],
};

const ReactionStreamList = styled.div`
    position: absolute;
    align-self: flex-end;
    height: 75vh;
    display: flex;
    flex-direction: column-reverse;
    margin-left: 10px;
    -webkit-mask: linear-gradient(#0000, #000);
    mask: linear-gradient(#0000, #0003, #000f);
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
        background: #FFFFFF;
        color: #090A0B;
  `}
`;

// add a list of reactions, on top of that add the hands up as the top element
export const ReactionStream = (props: Props) => {
    const reversed = [...props.reactions];

    reversed.reverse();
    const reactions = reversed.map((reaction) => {
        // emojis should be a separate component that is reused both here and in the extended view
        // getEmojiURL should be memoized as people tend to react similarly and this would speed up the process.
        const emoji = (<Emoji emoji={reaction.emoji}/>);
        const user = reaction.user_id === props.currentUserID ? 'You' : getUserDisplayName(props.profiles[reaction.user_id]) || 'Someone';
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
        return user_id === props.currentUserID ? 'You' : getUserDisplayName(props.profiles[user_id]);
    };
    let participants: string;
    if (props.handsup?.length) {
        switch (props.handsup?.length) {
        case 1:
            participants = `${getName(props.handsup[0])}`;
            break;
        case 2:
            participants = `${getName(props.handsup[0])} & ${getName(props.handsup[1])}`;
            break;
        case 3:
            participants = `${getName(props.handsup[0])}, ${getName(props.handsup[1])} & ${getName(props.handsup[2])}`;
            break;
        default:
            participants = `${getName(props.handsup[0])}, ${getName(props.handsup[1])} & ${props.handsup?.length - 2} others`;
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
        <ReactionStreamList>
            {elements}
        </ReactionStreamList>
    );
};
