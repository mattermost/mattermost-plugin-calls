import React from 'react';
import {useIntl} from 'react-intl';
import {endCall} from 'src/actions';
import {DropdownMenuItem, DropdownMenuSeparator} from 'src/components/dot_menu/dot_menu';
import styled from 'styled-components';

type Props = {
    callID: string;
    isHost: boolean;
    leaveCall: () => void;
}

export const LeaveCallMenu = ({callID, isHost, leaveCall}: Props) => {
    const {formatMessage} = useIntl();

    return (
        <>
            {isHost &&
                <>
                    <DropdownMenuItem onClick={() => endCall(callID)}>
                        <RedText>{formatMessage({defaultMessage: 'End call for everyone'})}</RedText>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator/>
                </>
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
