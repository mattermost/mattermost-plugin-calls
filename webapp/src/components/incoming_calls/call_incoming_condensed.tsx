import {GlobalState} from '@mattermost/types/store';
import {Client4} from 'mattermost-redux/client';
import {getTeammateNameDisplaySetting} from 'mattermost-redux/selectors/entities/preferences';
import {getUser} from 'mattermost-redux/selectors/entities/users';
import {displayUsername} from 'mattermost-redux/utils/user_utils';
import React from 'react';
import {FormattedMessage, useIntl} from 'react-intl';
import {useSelector} from 'react-redux';

import styled from 'styled-components';

import {useDismissJoin, useRingingAndNotification} from 'src/components/incoming_calls/hooks';

import Avatar from 'src/components/avatar/avatar';

import {Button} from 'src/components/buttons';
import CompassIcon from 'src/components/icons/compassIcon';

import {IncomingCallNotification} from 'src/types/types';

type Props = {
    call: IncomingCallNotification;
    onWidget?: boolean;
    global?: boolean;
};

export const CallIncomingCondensed = ({call, onWidget = false, global = false}: Props) => {
    const {formatMessage} = useIntl();
    const teammateNameDisplay = useSelector(getTeammateNameDisplaySetting);
    const caller = useSelector((state: GlobalState) => getUser(state, call.callerID));

    useRingingAndNotification(call, onWidget);
    const [onDismiss, onJoin] = useDismissJoin(call.channelID, call.callID, global);

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
        <Container>
            <Inner>
                <Row>
                    <Avatar
                        url={Client4.getProfilePictureUrl(caller.id, caller.last_picture_update)}
                        size={20}
                        border={false}
                    />
                    <Message>
                        {message}
                    </Message>
                    <SmallJoinButton onClick={onJoin}>
                        <CompassIcon icon={'phone-in-talk'}/>
                        {formatMessage({defaultMessage: 'Join'})}
                    </SmallJoinButton>
                    <XButton onClick={onDismiss}>
                        <CompassIcon icon={'close'}/>
                    </XButton>
                </Row>
            </Inner>
        </Container>
    );
};

const Container = styled.div`
    border-radius: 8px;
    background-color: var(--online-indicator);
`;

const Inner = styled.div`
    width: 100%;
    height: 100%;
    padding: 8px;
    font-weight: 400;
    font-size: 12px;
    background-color: rgba(0, 0, 0, 0.16);
`;

const Row = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
`;

const Message = styled.div`
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--button-color);
    margin: 0 auto 0 6px;
`;

const SmallJoinButton = styled(Button)`
    justify-content: center;
    height: 24px;
    padding: 4px 10px 4px 0;
    margin-left: 2px;
    font-weight: 600;
    font-size: 11px;

    background-color: rgba(var(--button-color-rgb), 0.12);
    color: var(--button-color);

    i {
        font-size: 14px;
        margin: 0 2px 0 5px;
    }
`;

const XButton = styled.button`
    border: 0;
    height: 24px;
    padding: 0 4px;
    margin-left: 2px;
    border-radius: 4px;
    background-color: transparent;
    color: rgba(var(--button-color-rgb), 0.56);

    &:hover {
        background-color: rgba(var(--button-color-rgb), 0.12);
    }
`;
