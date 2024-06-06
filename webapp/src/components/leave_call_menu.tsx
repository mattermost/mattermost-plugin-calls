import {isCurrentUserSystemAdmin} from 'mattermost-redux/selectors/entities/users';
import React from 'react';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import {endCall} from 'src/actions';
import {DropdownMenuItem, DropdownMenuSeparator} from 'src/components/dot_menu/dot_menu';
import styled from 'styled-components';

type Props = {
    callID: string;
    isHost: boolean;
    numParticipants: number;
    leaveCall: () => void;
}

export const LeaveCallMenu = ({callID, isHost, numParticipants, leaveCall}: Props) => {
    const {formatMessage} = useIntl();
    const isAdmin = useSelector(isCurrentUserSystemAdmin);
    const showEndCall = (isHost || isAdmin) && numParticipants > 1;

    return (
        <>
            {showEndCall &&
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
