// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import styled from 'styled-components';

import {getEmojiImageUrl} from 'mattermost-redux/utils/emoji_utils';
import {UserProfile} from '@mattermost/types/lib/users';

import {Emoji} from '../emoji/emoji';
import {ReactionWithUser} from 'src/types/types';
import {getUserDisplayName} from 'src/utils';

type Props = {
    reactions: ReactionWithUser[],
    currentUserID: string,
    profiles: {[key: string]: UserProfile;},
};

const ReactionStreamList = styled.div`
    position='absolute';
    left=0;
    bottom=100px;
    display: flex;
    flex-direction: column-reverse;
    margin-left: 10px;
    -webkit-mask: linear-gradient(#0000, #000);
    mask: linear-gradient(#0000, #0003, #000f);
`;

const ReactionChip = styled.div`
    display: flex;
    flex-direction: row;
    align-items: flex-end;
    padding: 4px 6px;
    gap: 4px;
    height: 23px;
    background: rgba(221, 223, 228, 0.08);
    border-radius: 12px;
    margin: 2px
`;

// add a list of reactions, on top of that add the hands up as the top element
export const ReactionStream = (props: Props) => {
    const reversed = [...props.reactions];


    // add hands up into reversed
    reversed.reverse();
    const elements = reversed.map((reaction) => {
        // emojis should be a separate component that is reused both here and in the extended view
        // getEmojiURL should be memoized as people tend to react similarly and this would speed up the process.
        const emoji = (<Emoji emoji={reaction.emoji}/>);
        const user = reaction.user_id === props.currentUserID ? 'you' : getUserDisplayName(props.profiles[reaction.user_id]) || 'someone';
        return (
            <ReactionChip key={reaction.timestamp + reaction.user_id}><span>{emoji}</span>&nbsp;<span>{user}</span></ReactionChip>
        );
    });
    return (
        <ReactionStreamList>
            {elements}
        </ReactionStreamList>
    );
};