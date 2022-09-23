// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import styled from 'styled-components';

type Props = {
    reactions: {emoji_name: string, emoji_unified: string, emoji_skin?: string, timestamp: number, userID: string}[],
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

// add a list of reactions, on top of that add the hands up as the top element
export const ReactionStream = (props: Props) => {
    console.log('final .reactions');
    console.log(props.reactions);
    const reversed = [...props.reactions];

    // temporary push items
    reversed.push({emoji_name: 'raised-hands', emoji_unified: 's1', emoji_skin: '', timestamp: 1, userID: 'ut3kxffbi7fxzfbz9igmc3ejte'});
    reversed.push({emoji_name: 'smiley', emoji_unified: 'ss', emoji_skin: '', timestamp: 2, userID: 'ut3kxffbi7fxzfbz9igmc3ejte'});

    // add hands up into reversed
    reversed.reverse();
    const elements = reversed.map((reaction) => {
        return (
            <div key={reaction.timestamp + reaction.userID}><span>{reaction.emoji_unified}</span>&nbsp;{reaction.userID}</div>
        );
    });
    return (
        <ReactionStreamList>
            {elements}
        </ReactionStreamList>
    );
};