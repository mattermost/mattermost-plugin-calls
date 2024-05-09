import {GlobalState} from '@mattermost/types/store';
import {getUser} from 'mattermost-redux/selectors/entities/users';
import React, {useEffect, useRef, useState} from 'react';
import {OverlayTrigger, Tooltip} from 'react-bootstrap';
import {FormattedMessage, useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import Avatar from 'src/components/avatar/avatar';
import {Button} from 'src/components/buttons';
import CompassIcon from 'src/components/icons/compassIcon';
import {
    useDismissJoin,
    useGetCallerNameAndOthers,
    useOnChannelLinkClick,
    useRingingAndNotification,
} from 'src/components/incoming_calls/hooks';
import RestClient from 'src/rest_client';
import {ChannelType, IncomingCallNotification} from 'src/types/types';
import styled, {css} from 'styled-components';

type Props = {
    call: IncomingCallNotification;
    onWidget?: boolean;
    joinButtonBorder?: boolean;
    className?: string;
};

export const CallIncomingCondensed = ({call, onWidget = false, joinButtonBorder = false, className}: Props) => {
    const {formatMessage} = useIntl();
    const messageRef = useRef<HTMLDivElement>(null);
    const caller = useSelector((state: GlobalState) => getUser(state, call.callerID));
    const [callerName, others] = useGetCallerNameAndOthers(call, 10);
    const [showTooltip, setShowTooltip] = useState(false);

    const [onDismiss, onJoin] = useDismissJoin(call.channelID, call.callID, onWidget);
    const onContainerClick = useOnChannelLinkClick(call, onWidget);
    useRingingAndNotification(call, onWidget);

    useEffect(() => {
        const show = Boolean(messageRef?.current && messageRef.current.clientWidth < messageRef.current.scrollWidth);
        setShowTooltip(show);
    }, [messageRef]);

    const message = (
        <FormattedMessage
            defaultMessage={'Call from <b>{callerName}</b> with <b>{others}</b>'}
            values={{
                b: (text: string) => <b>{text}</b>,
                callerName,
                others,
            }}
        />
    );

    let tooltip = formatMessage({defaultMessage: 'Call from {callerName}'}, {callerName});
    if (call.type === ChannelType.GM) {
        tooltip = formatMessage({defaultMessage: 'Call from {callerName} with {others}'}, {callerName, others});
    }

    return (
        <Container
            data-testid={onWidget ? 'call-incoming-condensed-widget' : 'call-incoming-condensed'}
            className={className}
            onClick={onContainerClick}
        >
            <Inner>
                <Avatar
                    url={RestClient.getProfilePictureUrl(caller.id, caller.last_picture_update)}
                    size={20}
                    border={false}
                />
                <OverlayTrigger
                    placement='top'
                    overlay={
                        <Tooltip id='tooltip-invite-message'>
                            {tooltip}
                        </Tooltip>
                    }
                    trigger={showTooltip ? ['hover', 'focus'] : []}
                >
                    <Message ref={messageRef}>
                        {message}
                    </Message>
                </OverlayTrigger>
                <SmallJoinButton
                    data-testid={'call-incoming-condensed-join'}
                    border={joinButtonBorder}
                    onClick={onJoin}
                >
                    <CompassIcon icon={'phone-in-talk'}/>
                    {formatMessage({defaultMessage: 'Join'})}
                </SmallJoinButton>
                <XButton
                    data-testid={'call-incoming-condensed-dismiss'}
                    onClick={onDismiss}
                >
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
