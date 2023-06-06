// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {useIntl} from 'react-intl';
import styled, {css} from 'styled-components';
import {useSelector} from 'react-redux';

import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';

import {
    idToProfileInConnectedChannel,
    voiceReactions,
    voiceUsersStatuses,
} from 'src/selectors';
import {Emoji} from 'src/components/emoji/emoji';
import {getUserDisplayName} from 'src/utils';
import HandEmoji from 'src/components/icons/hand';

// add a list of reactions, on top of that add the hands up as the top element
export const ReactionStream = () => {
    const {formatMessage, formatList} = useIntl();
    const currentUserID = useSelector(getCurrentUserId);

    const statuses = useSelector(voiceUsersStatuses);
    const profileMap = useSelector(idToProfileInConnectedChannel);

    const handsup = Object.keys(statuses)
        .flatMap((id) => (statuses[id]?.raised_hand ? [statuses[id]] : []))
        .sort((a, b) => a.raised_hand - b.raised_hand)
        .map((u) => u.id);

    const vReactions = useSelector(voiceReactions);
    const reversed = [...vReactions].reverse();
    const reactions = reversed.map((reaction) => {
        const emoji = (
            <Emoji
                emoji={reaction.emoji}
                size={18}
            />);
        const user = reaction.user_id === currentUserID ?
            formatMessage({defaultMessage: 'You'}) :
            getUserDisplayName(profileMap[reaction.user_id], true) || formatMessage({defaultMessage: 'Someone'});

        return (
            <ReactionChipOverlay key={reaction.timestamp + reaction.user_id}>
                <ReactionChip>
                    <span>{emoji}</span>
                    <span>{user}</span>
                </ReactionChip>
            </ReactionChipOverlay>
        );
    });

    // add hands up
    let elements = [];
    const getName = (user_id: string) => {
        return user_id === currentUserID ? formatMessage({defaultMessage: 'You'}) : getUserDisplayName(profileMap[user_id], true);
    };

    if (handsup?.length) {
        elements.push(
            <ReactionChip
                key={'hands'}
                highlight={true}
            >
                <HandEmoji
                    style={{
                        fill: 'var(--away-indicator)',
                        width: '18px',
                        height: '18px',
                    }}
                />
                <span>
                    <span>{formatMessage({defaultMessage: '{users} raised a hand'}, {
                        count: handsup.length,
                        users: formatList(handsup.map(getName), {type: 'conjunction', style: 'short'}),
                    })}</span>
                </span>
            </ReactionChip>);
    }

    elements = [...elements, ...reactions];

    return (
        <ReactionStreamList>
            {elements}
        </ReactionStreamList>
    );
};

const ReactionStreamList = styled.div`
    height: 75vh;
    display: flex;
    flex-direction: column-reverse;
    z-index: 1;
    margin: 0 24px;
    gap: 8px;
    -webkit-mask: -webkit-gradient(#0000, #000);
    mask: linear-gradient(#0000, #0003, #000f);
`;

interface chipProps {
    highlight?: boolean;
}

const ReactionChipOverlay = styled.div`
    background: var(--calls-bg);
    border-radius: 16px;
    width: fit-content;
`;

const ReactionChip = styled.div<chipProps>`
    display: flex;
    align-items: center;
    padding: 6px 16px 6px 8px;
    gap: 8px;
    color: white;
    background: rgba(255, 255, 255, 0.16);
    border-radius: 16px;
    width: fit-content;
    font-weight: 600;
    font-size: 14px;
    line-height: 20px;

    ${(props) => props.highlight && css`
        background: #FFFFFF;
        color: #090A0B;
  `}
`;

const Bold = styled.span`
    font-weight: 600;
`;
