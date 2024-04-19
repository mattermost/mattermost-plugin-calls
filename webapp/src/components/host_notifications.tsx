import React from 'react';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import CompassIcon from 'src/components/icons/compassIcon';
import {ReactionChip} from 'src/components/reaction_stream/reaction_stream';
import {HOST_CONTROL_NOTIFICATION_TIMEOUT} from 'src/constants';
import {hostControlNotificationsForCurrentCall} from 'src/selectors';
import {HostControlNotificationType} from 'src/types/types';
import styled, {css, keyframes} from 'styled-components';

type Props = {
    small?: boolean;
}

export const HostNotifications = ({small = false}: Props) => {
    const {formatMessage} = useIntl();
    const notifications = useSelector(hostControlNotificationsForCurrentCall);

    return (
        <>
            {notifications.map((n) => {
                switch (n.type) {
                case HostControlNotificationType.UnraisedHand:
                    return (
                        <Notification
                            key={n.notificationID}
                            $highlight={true}
                            $small={small}
                        >
                            <StyledCompassIcon
                                icon={'hand-right-outline-off'}
                                $small={small}
                            />
                            <Text $small={small}>
                                {formatMessage({defaultMessage: '{host} lowered your hand'},
                                    {host: n.displayName})}
                            </Text>
                        </Notification>
                    );
                default:
                    return null;
                }
            })}
        </>
    );
};

const slideInAnimation = keyframes`
    0%, 100% {
        transform: translateY(100%);
        opacity: 0;
    }
    10% {
        transform: translateY(0);
        opacity: 1;
    }
    90% {
        transform: translateY(0);
        opacity: 1;
    }
`;

const Notification = styled(ReactionChip)<{ $small?: boolean }>`
    animation: ${slideInAnimation} ${HOST_CONTROL_NOTIFICATION_TIMEOUT}ms ease-in-out 0.2s both;

    ${({$small}) => $small && css`
        width: 100%;
        border-radius: 6px;
        padding: 2px 4px;
        font-size: 11px;
        font-weight: 400;
        color: rgba(var(--center-channel-color-rgb), 0.64);
        white-space: pre;
        gap: 6px;
    `}
`;

const StyledCompassIcon = styled(CompassIcon)<{ $small?: boolean }>`
    color: var(--away-indicator);
    font-size: ${({$small}) => ($small ? 16 : 18)}px;
    margin-right: -5px;
    margin-left: -3px;
`;

const Text = styled.span<{ $small?: boolean }>`
    ${({$small}) => $small && css`
        overflow: hidden;
        text-overflow: ellipsis;
    `}
`;

