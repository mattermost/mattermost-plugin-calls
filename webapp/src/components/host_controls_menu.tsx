import React from 'react';
import {useIntl} from 'react-intl';
import {hostLowerHand, hostMake, hostMute, hostScreenOff} from 'src/actions';
import {DropdownMenuItem, DropdownMenuSeparator} from 'src/components/dot_menu/dot_menu';
import {StyledMonitorAccount} from 'src/components/expanded_view/styled_components';
import CompassIcon from 'src/components/icons/compassIcon';
import styled from 'styled-components';

type Props = {
    callID?: string;
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

    const muteUnmute = isMuted ? null : (
        <DropdownMenuItem onClick={() => hostMute(callID, sessionID)}>
            <StyledCompassIcon
                data-testid={'host-mute'}
                icon={'microphone-off'}
            />
            {formatMessage({defaultMessage: 'Mute participant'})}
        </DropdownMenuItem>
    );

    const showingAtLeastOne = !isMuted || isSharingScreen || isHandRaised || !isHost;

    return (
        <>
            {muteUnmute}
            {isSharingScreen &&
                <DropdownMenuItem onClick={() => hostScreenOff(callID, sessionID)}>
                    <StyledCompassIcon icon={'monitor-off'}/>
                    {formatMessage({defaultMessage: 'Stop screen share'})}
                </DropdownMenuItem>
            }
            {isHandRaised &&
                <DropdownMenuItem onClick={() => hostLowerHand(callID, sessionID)}>
                    <StyledCompassIcon icon={'hand-right-outline-off'}/>
                    {formatMessage({defaultMessage: 'Lower hand'})}
                </DropdownMenuItem>
            }
            {!isHost &&
                <DropdownMenuItem onClick={() => hostMake(callID, userID)}>
                    <StyledMonitorAccount/>
                    {formatMessage({defaultMessage: 'Make host'})}
                </DropdownMenuItem>
            }
            {showingAtLeastOne &&
                <DropdownMenuSeparator/>
            }
            <DropdownMenuItem onClick={onRemove}>
                <RedCompassIcon icon={'minus-circle-outline'}/>
                <RedText>{formatMessage({defaultMessage: 'Remove from call'})}</RedText>
            </DropdownMenuItem>
        </>
    );
};

const StyledCompassIcon = styled(CompassIcon)`
    color: var(--center-channel-color-56);
    font-size: 16px;
    margin-right: 8px;
    margin-left: -2px;
    margin-top: 2px;
`;

const RedCompassIcon = styled(StyledCompassIcon)`
    color: var(--dnd-indicator);
`;

const RedText = styled.span`
    color: var(--dnd-indicator);
`;
