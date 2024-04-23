import React from 'react';
import {useIntl} from 'react-intl';
import {makeHost, muteSession, screenOff, unraiseHand} from 'src/actions';
import {DropdownMenuItem} from 'src/components/dot_menu/dot_menu';
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
}

export const HostControlsMenu = ({callID, userID, sessionID, isMuted, isSharingScreen, isHandRaised}: Props) => {
    const {formatMessage} = useIntl();

    if (!callID) {
        return null;
    }

    const muteUnmute = isMuted ? null : (
        <DropdownMenuItem onClick={() => muteSession(callID, sessionID)}>
            <StyledCompassIcon icon={'microphone-off'}/>
            {formatMessage({defaultMessage: 'Mute participant'})}
        </DropdownMenuItem>
    );

    // TODO: don't show 'make host' for host; keeping for now bc we will show other menu items next
    return (
        <>
            {muteUnmute}
            {isSharingScreen &&
                <DropdownMenuItem onClick={() => screenOff(callID, sessionID)}>
                    <StyledCompassIcon icon={'monitor-off'}/>
                    {formatMessage({defaultMessage: 'Stop screen share'})}
                </DropdownMenuItem>
            }
            {isHandRaised &&
                <DropdownMenuItem onClick={() => unraiseHand(callID, sessionID)}>
                    <StyledCompassIcon icon={'hand-right-outline-off'}/>
                    {formatMessage({defaultMessage: 'Lower hand'})}
                </DropdownMenuItem>
            }
            <DropdownMenuItem onClick={() => makeHost(callID, userID)}>
                <StyledMonitorAccount/>
                {formatMessage({defaultMessage: 'Make host'})}
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
