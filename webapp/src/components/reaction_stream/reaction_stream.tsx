// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {
    UserSessionState,
} from '@mattermost/calls-common/lib/types';
import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';
import React from 'react';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import {Emoji} from 'src/components/emoji/emoji';
import {HostNotices} from 'src/components/host_notices';
import HandEmoji from 'src/components/icons/hand';
import {
    hostControlNoticesForCurrentCall,
    profilesInCurrentCallMap,
    reactionsInCurrentCall,
    sessionsInCurrentCall,
} from 'src/selectors';
import {getUserDisplayName, split} from 'src/utils';
import styled, {css} from 'styled-components';

// add a list of reactions, on top of that add the hands up as the top element
export const ReactionStream = () => {
    const {formatMessage, formatList} = useIntl();

    const currentUserID = useSelector(getCurrentUserId);
    const sessions = useSelector(sessionsInCurrentCall);
    const profileMap = useSelector(profilesInCurrentCallMap);
    const vReactions = useSelector(reactionsInCurrentCall);
    const hostNotices = useSelector(hostControlNoticesForCurrentCall);

    const reversed = [...vReactions].reverse();
    const reactions = reversed.map((reaction) => {
        const emoji = (
            <Emoji
                emoji={reaction.emoji}
                size={18}
            />
        );
        const user = reaction.user_id === currentUserID ? formatMessage({defaultMessage: 'You'}) : getUserDisplayName(profileMap[reaction.user_id], true) || formatMessage({defaultMessage: 'Someone'});

        return (
            <ReactionChipOverlay key={reaction.timestamp + reaction.user_id}>
                <ReactionChip>
                    <span>{emoji}</span>
                    <span>{user}</span>
                </ReactionChip>
            </ReactionChipOverlay>
        );
    });

    let handsUp;
    const sessionsHandsUp = sessions.filter((session) => session.raised_hand).sort((a, b) => a.raised_hand - b.raised_hand);

    if (sessionsHandsUp.length > 0) {
        const getName = (session: UserSessionState) => {
            return session.user_id === currentUserID ? formatMessage({defaultMessage: 'You'}) : getUserDisplayName(profileMap[session.user_id], true);
        };
        const [displayed, overflowed] = split(sessionsHandsUp, 2, true);
        const userList = displayed.map(getName);

        if (overflowed) {
            userList.push(formatMessage({defaultMessage: '{num, plural, one {# other} other {# others}}'}, {num: overflowed.length}));
        }

        handsUp = (
            <ReactionChip
                key={'hands'}
                $highlight={true}
            >
                <HandEmoji
                    style={{
                        fill: 'var(--away-indicator)',
                        width: '18px',
                        height: '18px',
                    }}
                />
                <span>
                    {formatMessage({defaultMessage: '{users} raised a hand'}, {
                        count: sessionsHandsUp.length,
                        users: <Bold>{formatList(userList)}</Bold>,
                    })}
                </span>
            </ReactionChip>
        );
    }

    return (
        <ReactionStreamList>
            {hostNotices.length > 0 && <HostNotices/>}
            {handsUp}
            {reactions}
        </ReactionStreamList>
    );
};

const ReactionStreamList = styled.div`
    height: 75vh;
    display: flex;
    flex-direction: column-reverse;
    margin: 0 24px;
    gap: 8px;
    -webkit-mask: -webkit-gradient(#0000, #000);
    mask: linear-gradient(#0000, #0003, #000f);
    pointer-events: none;
`;

interface chipProps {
    $highlight?: boolean;
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

    ${(props) => props.$highlight && css`
        background: #FFFFFF;
        color: #090A0B;
    `}
`;

const Bold = styled.span`
    font-weight: 600;
`;
