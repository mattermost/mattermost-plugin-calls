// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useState} from 'react';
import styled from 'styled-components';

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
    align-self: flex-end;
    height: 75vh;
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
    padding: 2px 10px;
    gap: 2px;
    height: 23px;
    background: rgba(221, 223, 228, 0.08);
    border-radius: 12px;
    margin: 4px 0;
    width: fit-content;
`;

// add a list of reactions, on top of that add the hands up as the top element
export const ReactionStream = (props: Props) => {
    const [activeAnimation, setActiveAnimation] = useState(false);

    useEffect(() => {
        setActiveAnimation(false);
        return () => {
            setTimeout(() => {
                setActiveAnimation(true);
            }, 10);
        };
    }, [props.reactions]);

    const reversed = [...props.reactions];

    // add hands up into reversed
    reversed.reverse();
    const elements = reversed.map((reaction) => {
        // emojis should be a separate component that is reused both here and in the extended view
        // getEmojiURL should be memoized as people tend to react similarly and this would speed up the process.
        const emoji = (<Emoji emoji={reaction.emoji}/>);
        const user = reaction.user_id === props.currentUserID ? 'You' : getUserDisplayName(props.profiles[reaction.user_id]) || 'Someone';
        return (
            <ReactionChip
                key={reaction.timestamp + reaction.user_id}
                style={activeAnimation ? {
                    transform: 'translate(0, -23px)', transition: 'transform 1s',
                } : {}}
            >
                <span>{emoji}</span>
                &nbsp;
                <span>{user}</span>
            </ReactionChip>
        );
    });
    return (
        <ReactionStreamList>
            {elements}
        </ReactionStreamList>
    );
};