import {GlobalState} from '@mattermost/types/store';
import {Client4} from 'mattermost-redux/client';
import {getTeammateNameDisplaySetting} from 'mattermost-redux/selectors/entities/preferences';
import {getUser} from 'mattermost-redux/selectors/entities/users';
import {displayUsername} from 'mattermost-redux/utils/user_utils';
import React from 'react';
import {FormattedMessage, useIntl} from 'react-intl';
import {useSelector} from 'react-redux';

import styled, {css} from 'styled-components';

import {useDismissJoin, useOnChannelLinkClick, useRingingAndNotification} from 'src/components/incoming_calls/hooks';

import Avatar from 'src/components/avatar/avatar';

import {Button} from 'src/components/buttons';
import CompassIcon from 'src/components/icons/compassIcon';

import {IncomingCallNotification} from 'src/types/types';

type Props = {
    call: IncomingCallNotification;
    onWidget?: boolean;
    joinButtonBorder?: boolean;
    className?: string;
};

export const CallIncomingCondensed = ({call, onWidget = false, joinButtonBorder = false, className}: Props) => {
    const {formatMessage} = useIntl();
    const teammateNameDisplay = useSelector(getTeammateNameDisplaySetting);
    const caller = useSelector((state: GlobalState) => getUser(state, call.callerID));

    const [onDismiss, onJoin] = useDismissJoin(call.channelID, call.callID);
    const onContainerClick = useOnChannelLinkClick(call);
    useRingingAndNotification(call, onWidget);

    const callerName = displayUsername(caller, teammateNameDisplay, false);
    const message = (
        <FormattedMessage
            defaultMessage={'Call from <b>{callerName}</b>'}
            values={{
                b: (text: string) => <b>{text}</b>,
                callerName,
            }}
        />
    );

    return (
        <Container
            className={className}
            onClick={onContainerClick}
        >
            <Inner>
                <Avatar
                    url={Client4.getProfilePictureUrl(caller.id, caller.last_picture_update)}
                    size={20}
                    border={false}
                />
                <Message>
                    {message}
                </Message>
                <SmallJoinButton
                    border={joinButtonBorder}
                    onClick={onJoin}
                >
                    <CompassIcon icon={'phone-in-talk'}/>
                    {formatMessage({defaultMessage: 'Join'})}
                </SmallJoinButton>
                <XButton onClick={onDismiss}>
                    <CompassIcon icon={'close'}/>
                </XButton>
            </Inner>
        </Container>
    );
};

const Container = styled.button`
    border-radius: 8px;
    background-color: var(--online-indicator);
    padding: 0;
    border: 0;
`;

const Inner = styled.div`
    width: 100%;
    height: 100%;
    padding: 8px;
    font-weight: 400;
    font-size: 12px;
    background-color: rgba(0, 0, 0, 0.16);
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 6px;
`;

const Message = styled.div`
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--button-color);
    margin-right: auto;
`;

const SmallJoinButton = styled(Button)<{ border: boolean }>`
    justify-content: center;
    height: 24px;
    padding: 4px 10px 4px 0;
    font-weight: 600;
    font-size: 11px;

    background-color: rgba(var(--button-color-rgb), 0.12);
    color: var(--button-color);

    ${({border}) => border && css`
        background-color: transparent;
        border-radius: 4px;
        border: 1px solid var(--button-color);

        &:hover {
            background-color: rgba(var(--button-color-rgb), 0.12);
        }
    `}
    i {
        font-size: 15px;
        margin: 0 2px 0 5px;
    }
`;

const XButton = styled.button`
    border: 0;
    height: 24px;
    padding: 0 3px;
    margin-left: -2px;
    border-radius: 4px;
    font-size: 15px;
    background-color: transparent;
    color: rgba(var(--button-color-rgb), 0.56);

    &:hover {
        background-color: rgba(var(--button-color-rgb), 0.12);
    }
`;
