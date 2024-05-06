import React from 'react';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import CompassIcon from 'src/components/icons/compassIcon';
import {HOST_CONTROL_NOTIFICATION_TIMEOUT} from 'src/constants';
import {hostControlNotificationsForCurrentCall} from 'src/selectors';
import {HostControlNotificationType} from 'src/types/types';
import styled, {css, keyframes} from 'styled-components';

type Props = {
    onWidget?: boolean;
}

export const HostNotifications = ({onWidget = false}: Props) => {
    const {formatMessage} = useIntl();
    const notifications = useSelector(hostControlNotificationsForCurrentCall);

    return (
        <>
            {notifications.map((n) => {
                switch (n.type) {
                case HostControlNotificationType.LowerHand:
                    return (
                        <Notification
                            key={n.notificationID}
                            $onWidget={onWidget}
                        >
                            <StyledCompassIcon
                                icon={'hand-right-outline-off'}
                                $onWidget={onWidget}
                            />
                            <Text $onWidget={onWidget}>
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

const Notification = styled.div<{ $onWidget?: boolean }>`
    animation: ${slideInAnimation} ${HOST_CONTROL_NOTIFICATION_TIMEOUT}ms ease-in-out 0.2s both;
    display: flex;
    align-items: center;
    padding: 6px 16px 6px 8px;
    gap: 8px;
    border-radius: 16px;
    width: fit-content;
    font-weight: 600;
    font-size: 14px;
    line-height: 20px;
    background: #FFFFFF;
    color: #090A0B;

    ${({$onWidget}) => $onWidget && css`
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

const StyledCompassIcon = styled(CompassIcon)<{ $onWidget?: boolean }>`
    color: var(--away-indicator);
    font-size: ${({$onWidget}) => ($onWidget ? 16 : 18)}px;
    margin-right: -5px;
    margin-left: -3px;
`;

const Text = styled.span<{ $onWidget?: boolean }>`
    ${({$onWidget}) => $onWidget && css`
        overflow: hidden;
        text-overflow: ellipsis;
    `}
`;
