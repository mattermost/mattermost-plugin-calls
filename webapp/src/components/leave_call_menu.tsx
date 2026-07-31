// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {isCurrentUserSystemAdmin} from 'mattermost-redux/selectors/entities/users';
import React from 'react';
import {defineMessage, useIntl} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';
import {displayGenericErrorModal, hostEndCallForEveryone} from 'src/actions';
import {DropdownMenuItem} from 'src/components/dot_menu/dot_menu';
import {logErr} from 'src/log';
import {modals} from 'src/webapp_globals';
import styled from 'styled-components';

type Props = {
    channelID: string;
    isHost: boolean;
    numParticipants: number;
    leaveCall: () => void;
}

export const LeaveCallMenu = ({channelID, isHost, numParticipants, leaveCall}: Props) => {
    const {formatMessage} = useIntl();

    const dispatch = useDispatch();

    const isAdmin = useSelector(isCurrentUserSystemAdmin);
    const shouldShowWarningMenuItemForEndingCall = (isHost || isAdmin) && numParticipants > 1;

    async function handleHostEndCallForEveryone() {
        try {
            await hostEndCallForEveryone(channelID);
        } catch (err) {
            logErr('failed to end call for everyone', err);
            if (modals) {
                dispatch(displayGenericErrorModal(
                    defineMessage({defaultMessage: 'Unable to end the call'}),
                    defineMessage({defaultMessage: 'Something went wrong while trying to end the call. Please try again.'}),
                ));
            }
        }
    }

    return (
        <>
            {shouldShowWarningMenuItemForEndingCall &&
                <DropdownMenuItem onClick={handleHostEndCallForEveryone}>
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
