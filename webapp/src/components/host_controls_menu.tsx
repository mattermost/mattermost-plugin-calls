import React from 'react';
import {useIntl} from 'react-intl';
import {hostLowerHand, hostMake, hostMute, hostScreenOff} from 'src/actions';
import {DropdownMenuItem, DropdownMenuSeparator} from 'src/components/dot_menu/dot_menu';
import MinusCircleOutlineIcon from 'src/components/icons/minus_circle_outline';
import MonitorAccount from 'src/components/icons/monitor_account';
import MutedIcon from 'src/components/icons/muted_icon';
import UnraisedHandIcon from 'src/components/icons/unraised_hand';
import UnshareScreenIcon from 'src/components/icons/unshare_screen';
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
            <MutedIcon
                data-testid={'host-mute'}
                fill='var(--center-channel-color-56)'
                style={{width: '16px', height: '16px'}}
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
                    <UnshareScreenIcon
                        fill='var(--center-channel-color-56)'
                        style={{width: '16px', height: '16px'}}
                    />
                    {formatMessage({defaultMessage: 'Stop screen share'})}
                </DropdownMenuItem>
            }
            {isHandRaised &&
                <DropdownMenuItem onClick={() => hostLowerHand(callID, sessionID)}>
                    <UnraisedHandIcon
                        fill='var(--center-channel-color-56)'
                        style={{width: '16px', height: '16px'}}
                    />
                    {formatMessage({defaultMessage: 'Lower hand'})}
                </DropdownMenuItem>
            }
            {!isHost &&
                <DropdownMenuItem onClick={() => hostMake(callID, userID)}>
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
