// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {useIntl} from 'react-intl';
import {DropdownMenuItem, DropdownMenuSeparator} from 'src/components/dot_menu/dot_menu';
import MinusCircleOutlineIcon from 'src/components/icons/minus_circle_outline';
import MonitorAccount from 'src/components/icons/monitor_account';
import MutedIcon from 'src/components/icons/muted_icon';
import UnraisedHandIcon from 'src/components/icons/unraised_hand';
import UnshareScreenIcon from 'src/components/icons/unshare_screen';
import {logDebug} from 'src/log';
import {ActiveCall} from 'src/state/active_calls/reducer';
import {hostLowerParticipantHand, hostMakeParticipantHost, hostMuteParticipant, hostSwitchParticipantScreenOff} from 'src/state/hosts/actions';
import styled from 'styled-components';

type Props = {
    callID: ActiveCall['callID'];
    userID: string;
    sessionID: string;
    isMuted: boolean;
    isSharingScreen: boolean;
    isHandRaised: boolean;
    isHost: boolean;
    onRemove: () => void;
}

export const HostControlsMenu = ({
    callID,
    userID,
    sessionID,
    isMuted,
    isSharingScreen,
    isHandRaised,
    isHost,
    onRemove,
}: Props) => {
    const {formatMessage} = useIntl();

    if (!callID) {
        return null;
    }

    function handlehostMuteParticipant() {
        logDebug(`HostControlsMenu: mute participant ${sessionID}`);
        hostMuteParticipant(callID, sessionID);
    }

    function handlehostMakeParticipantHost() {
        logDebug(`HostControlsMenu: make host ${userID}`);
        hostMakeParticipantHost(callID, userID);
    }

    function handleStopParticipantScreenShare() {
        logDebug(`HostControlsMenu: stop screen share for ${sessionID}`);
        hostSwitchParticipantScreenOff(callID, sessionID);
    }

    function handleLowerParticipantHand() {
        logDebug(`HostControlsMenu: lower hand for ${sessionID}`);
        hostLowerParticipantHand(callID, sessionID);
    }

    const showingAtLeastOne = !isMuted || isSharingScreen || isHandRaised || !isHost;

    return (
        <>
            {!isMuted && (
                <DropdownMenuItem
                    onClick={handlehostMuteParticipant}
                >
                    <MutedIcon
                        data-testid={'host-mute'}
                        fill='var(--center-channel-color-56)'
                        style={{width: '16px', height: '16px'}}
                    />
                    {formatMessage({defaultMessage: 'Mute participant'})}
                </DropdownMenuItem>
            )}
            {isSharingScreen &&
                <DropdownMenuItem
                    onClick={handleStopParticipantScreenShare}
                >
                    <UnshareScreenIcon
                        fill='var(--center-channel-color-56)'
                        style={{width: '16px', height: '16px'}}
                    />
                    {formatMessage({defaultMessage: 'Stop screen share'})}
                </DropdownMenuItem>
            }
            {isHandRaised &&
                <DropdownMenuItem
                    onClick={handleLowerParticipantHand}
                >
                    <UnraisedHandIcon
                        fill='var(--center-channel-color-56)'
                        style={{width: '16px', height: '16px'}}
                    />
                    {formatMessage({defaultMessage: 'Lower hand'})}
                </DropdownMenuItem>
            }
            {!isHost &&
                <DropdownMenuItem
                    onClick={handlehostMakeParticipantHost}
                >
                    <MonitorAccount
                        fill='var(--center-channel-color-56)'
                        style={{width: '16px', height: '16px'}}
                    />
                    {formatMessage({defaultMessage: 'Make host'})}
                </DropdownMenuItem>
            }
            {showingAtLeastOne &&
                <DropdownMenuSeparator/>
            }
            <DropdownMenuItem onClick={onRemove}>
                <MinusCircleOutlineIcon
                    fill='var(--dnd-indicator)'
                    style={{width: '16px', height: '16px'}}
                />
                <RedText>{formatMessage({defaultMessage: 'Remove from call'})}</RedText>
            </DropdownMenuItem>
        </>
    );
};

const RedText = styled.span`
    color: var(--dnd-indicator);
`;
