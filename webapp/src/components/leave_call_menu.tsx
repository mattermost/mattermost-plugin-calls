// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {isCurrentUserSystemAdmin} from 'mattermost-redux/selectors/entities/users';
import React from 'react';
import {defineMessage, useIntl} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';
import {displayGenericErrorModal, hostEndCallForEveryone} from 'src/actions';
import {DropdownMenuItem} from 'src/components/dot_menu/dot_menu';
import {logDebug, logErr} from 'src/log';
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
        logDebug('LeaveCallMenu.handleHostEndCallForEveryone: host ending call for everyone');
        try {
            await hostEndCallForEveryone(channelID);
        } catch (err) {
            // A TypeError (e.g. "Failed to fetch") means the browser aborted the request
            // before JS could process the response — typically because the popout window
            // was closed by the DISCONNECTED handler while the fetch was in-flight. The
            // call did end successfully; nothing to surface.
            if (err instanceof TypeError) {
                return;
            }

            logErr('failed to end call for everyone', err);

            // A TypeError means the HTTP connection was reset at the network level (e.g.
            // "Failed to fetch"). This happens when the server ends the call and cleans
            // up state before the response body reaches the client — the call did end
            // successfully. Suppress the error modal; there's nothing for the user to do.
            if (err instanceof TypeError) {
                return;
            }

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
