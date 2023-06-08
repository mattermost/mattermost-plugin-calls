import {GlobalState} from '@mattermost/types/store';
import {Client4} from 'mattermost-redux/client';
import {getTeammateNameDisplaySetting} from 'mattermost-redux/selectors/entities/preferences';
import {
    getCurrentUser,
    getUser,
    makeGetProfilesInChannel,
} from 'mattermost-redux/selectors/entities/users';
import {displayUsername} from 'mattermost-redux/utils/user_utils';
import React from 'react';
import {FormattedMessage, useIntl} from 'react-intl';
import {useSelector} from 'react-redux';

import styled from 'styled-components';

import {split} from 'src/utils';

import {useDismissJoin, useRinging} from 'src/components/incoming_calls/hooks';
import Avatar from 'src/components/avatar/avatar';
import {Button} from 'src/components/buttons';
import CompassIcon from 'src/components/icons/compassIcon';
import {ChannelType, IncomingCallNotification} from 'src/types/types';

type Props = {
    call: IncomingCallNotification;
};

export const CallIncoming = ({call}: Props) => {
    const {formatMessage, formatList} = useIntl();
    const teammateNameDisplay = useSelector(getTeammateNameDisplaySetting);
    const host = useSelector((state: GlobalState) => getUser(state, call.hostID));
    const currentUser = useSelector(getCurrentUser);

    useRinging(call, false);
    const [onDismiss, onJoin] = useDismissJoin(call.callID, call.startAt);

    const hostName = displayUsername(host, teammateNameDisplay, false);

    // This must be done outside the if statements
    const doGetProfilesInChannel = makeGetProfilesInChannel();
    const gmMembers = useSelector((state: GlobalState) => doGetProfilesInChannel(state, call.callID));

    let message;
    if (call.type === ChannelType.DM) {
        message = (
            <FormattedMessage
                defaultMessage={'<b>{hostName}</b> is inviting you to a call'}
                values={{
                    b: (text: string) => <b>{text}</b>,
                    hostName,
                }}
            />
        );
    } else if (call.type === ChannelType.GM) {
        const otherMembers = gmMembers.filter((u) => u.id !== host.id && u.id !== currentUser.id);
        const [displayed, overflowed] = split(otherMembers, 2);
        const userList = displayed.map((u) => displayUsername(u, teammateNameDisplay));
        if (overflowed) {
            userList.push(formatMessage({defaultMessage: '{num, plural, one {# other} other {# others}}'},
                {num: overflowed.length}));
        }

        message = (
            <FormattedMessage
                defaultMessage={'<b>{hostName}</b> is inviting you to a call with <b>{others}</b>'}
                values={{
                    b: (text: string) => <b>{text}</b>,
                    hostName,
                    others: formatList(userList),
                }}
            />
        );
    }

    return (
        <Container>
            <Inner>
                <Row>
                    <Avatar
                        url={Client4.getProfilePictureUrl(host.id, host.last_picture_update)}
                        border={false}
                    />
                    <Message>
                        {message}
                    </Message>
                </Row>
                <RowSpaced>
                    <WideButton
                        onClick={onDismiss}
                        css={'margin-right: 12px'}
                    >
                        <CompassIcon
                            icon={'close'}
                            css={'margin-right: 2px'}
                        />
                        {formatMessage({defaultMessage: 'Ignore'})}
                    </WideButton>
                    <JoinButton onClick={onJoin}>
                        <CompassIcon
                            icon={'phone-in-talk'}
                            css={'margin-right: 5px'}
                        />
                        {formatMessage({defaultMessage: 'Join'})}
                    </JoinButton>
                </RowSpaced>
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
    font-size: 14px;
    line-height: 20px;
    background-color: rgba(0, 0, 0, 0.16);
`;

const Row = styled.div`
    display: flex;
    flex-direction: row;
`;

const Message = styled.div`
    color: var(--button-color);
    margin-left: 10px;
`;

const RowSpaced = styled(Row)`
    justify-content: space-around;
    margin-top: 16px;
`;

const WideButton = styled(Button)`
    flex: 1;
    max-width: 126px;
    justify-content: center;

    background-color: rgba(var(--button-color-rgb), 0.12);
    color: var(--button-color);
`;

const JoinButton = styled(WideButton)`
    background-color: var(--button-color);
    color: var(--online-indicator);

    &:hover {
        background-color: rgba(var(--button-color-rgb), 0.88);
    }
`;
