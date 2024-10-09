import {Channel} from '@mattermost/types/channels';
import {GlobalState} from '@mattermost/types/store';
import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {isCurrentUserSystemAdmin} from 'mattermost-redux/selectors/entities/users';
import React from 'react';
import {useIntl} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';
import {
    EndCallConfirmation,
    IDEndCallConfirmation,
} from 'src/components/call_widget/end_call_confirmation';
import {DropdownMenuItem, DropdownMenuSeparator} from 'src/components/dot_menu/dot_menu';
import {DesktopMessageShowEndCallModal} from 'src/types/types';
import {getChannelURL, sendDesktopMessage} from 'src/utils';
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
    const isAdmin = useSelector(isCurrentUserSystemAdmin);
    const channel = useSelector<GlobalState, Channel|undefined>((state) => getChannel(state, channelID));
    const channelURL = useSelector<GlobalState, string>((state) => getChannelURL(state, channel, channel?.team_id));
    const showEndCall = (isHost || isAdmin) && numParticipants > 1;
    const dispatch = useDispatch();

    const endCallHandler = () => {
        if (modals) {
            dispatch(modals.openModal({
                modalId: IDEndCallConfirmation,
                dialogType: EndCallConfirmation,
                dialogProps: {
                    channelID,
                },
            }));
        } else {
            // global widget case
            sendDesktopMessage(DesktopMessageShowEndCallModal);

            // This is a workaround to ensure the center channel gets focus.
            window.desktopAPI?.openLinkFromCalls(channelURL);
        }
    };

    return (
        <>
            {showEndCall &&
                <>
                    <DropdownMenuItem onClick={() => endCallHandler()}>
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
