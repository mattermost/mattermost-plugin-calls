// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {isCurrentUserSystemAdmin} from 'mattermost-redux/selectors/entities/users';
import React from 'react';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import {endCall} from 'src/actions';
import {DropdownMenuItem} from 'src/components/dot_menu/dot_menu';
import styled from 'styled-components';

type Props = {
    channelID: string;
    isHost: boolean;
    numParticipants: number;
    leaveCall: () => void;
}

export const LeaveCallMenu = ({channelID, isHost, numParticipants, leaveCall}: Props) => {
    const {formatMessage} = useIntl();
    const isAdmin = useSelector(isCurrentUserSystemAdmin);
    const showEndCall = (isHost || isAdmin) && numParticipants > 1;

    return (
        <>
            {showEndCall &&
                <DropdownMenuItem onClick={() => endCall(channelID)}>
                    <EndCallOption>
                        <RedText>{formatMessage({defaultMessage: 'End call for everyone'})}</RedText>
                        <SubtitleText>{formatMessage({defaultMessage: 'All participants will be disconnected'})}</SubtitleText>
                    </EndCallOption>
                </DropdownMenuItem>
            }
            <DropdownMenuItem onClick={leaveCall}>
                <RedText>{formatMessage({defaultMessage: 'Leave call'})}</RedText>
            </DropdownMenuItem>
            <DropdownMenuItem>
                {formatMessage({defaultMessage: 'Cancel'})}
            </DropdownMenuItem>
        </>
    );
};

const RedText = styled.span`
    color: var(--dnd-indicator);
`;

const EndCallOption = styled.div`
    display: flex;
    flex-direction: column;
`;

const SubtitleText = styled.span`
    color: rgba(var(--center-channel-color-rgb), 0.56);
    font-size: 12px;
    margin-top: 2px;
`;
