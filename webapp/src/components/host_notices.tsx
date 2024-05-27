import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';
import React from 'react';
import {FormattedMessage} from 'react-intl';
import {useSelector} from 'react-redux';
import CompassIcon from 'src/components/icons/compassIcon';
import MonitorAccount from 'src/components/icons/monitor_account';
import {HOST_CONTROL_NOTICE_TIMEOUT} from 'src/constants';
import {hostControlNoticesForCurrentCall} from 'src/selectors';
import {HostControlNoticeType} from 'src/types/types';
import styled, {css, keyframes} from 'styled-components';

type Props = {
    onWidget?: boolean;
}

export const HostNotices = ({onWidget = false}: Props) => {
    const currentUserId = useSelector(getCurrentUserId);
    const notices = useSelector(hostControlNoticesForCurrentCall);

    const youAreHostMsg = <FormattedMessage defaultMessage={'You are now the host'}/>;

    return (
        <>
            {notices.map((n) => {
                switch (n.type) {
                case HostControlNoticeType.LowerHand:
                    return (
                        <Notice
                            key={n.noticeID}
                            data-testid={'notice-lower-hand'}
                            $onWidget={onWidget}
                        >
                            <StyledCompassIcon
                                icon={'hand-right-outline-off'}
                                $onWidget={onWidget}
                            />
                            <Text $onWidget={onWidget}>
                                <FormattedMessage
                                    defaultMessage={'<b>{host}</b> lowered your hand'}
                                    values={{
                                        b: (text: string) => <b>{text}</b>,
                                        host: n.displayName,
                                    }}
                                />
                            </Text>
                        </Notice>
                    );
                case HostControlNoticeType.HostChanged:
                    return (
                        <Notice
                            key={n.noticeID}
                            data-testid={'notice-host-changed'}
                            $onWidget={onWidget}
                        >
                            <StyledMonitorAccount $onWidget={onWidget}/>
                            <Text $onWidget={onWidget}>
                                {n.userID === currentUserId ? youAreHostMsg : (
                                    <FormattedMessage
                                        defaultMessage={'<b>{name}</b> is now the host'}
                                        values={{
                                            b: (text: string) => <b>{text}</b>,
                                            name: n.displayName,
                                        }}
                                    />)
                                }
                            </Text>
                        </Notice>
                    );
                case HostControlNoticeType.HostRemoved:
                    return (
                        <Notice
                            key={n.noticeID}
                            data-testid={'notice-removed'}
                            $onWidget={onWidget}
                        >
                            <RedStyledCompassIcon
                                icon={'minus-circle-outline'}
                                $onWidget={onWidget}
                            />
                            <Text $onWidget={onWidget}>
                                <FormattedMessage
                                    defaultMessage={'<b>{name}</b> was removed from the call'}
                                    values={{
                                        b: (text: string) => <b>{text}</b>,
                                        name: n.displayName,
                                    }}
                                />
                            </Text>
                        </Notice>
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

const Notice = styled.div<{ $onWidget?: boolean }>`
    animation: ${slideInAnimation} ${HOST_CONTROL_NOTICE_TIMEOUT}ms ease-in-out 0.2s both;
    display: flex;
    align-items: center;
    padding: 6px 16px 6px 8px;
    gap: 8px;
    border-radius: 16px;
    width: fit-content;
    font-weight: 600;
    font-size: 14px;
    line-height: 20px;
    background: var(--button-color);

    ${({$onWidget}) => $onWidget && css`
        width: 100%;
        border-radius: 8px;
        padding: 4px 6px;
        font-size: 11px;
        font-weight: 400;
        white-space: pre;
        background: var(--center-channel-bg);
        border: solid 1px rgba(var(--center-channel-color-rgb), 0.16);
        box-shadow: 0 6px 14px 0 rgba(0, 0, 0, 0.12);
    `}
`;

const StyledCompassIcon = styled(CompassIcon)<{ $onWidget?: boolean }>`
    color: var(--away-indicator);
    font-size: ${({$onWidget}) => ($onWidget ? 16 : 18)}px;
    margin-right: ${({$onWidget}) => ($onWidget ? -4 : -5)}px;
    margin-left: -3px;
`;

const RedStyledCompassIcon = styled(StyledCompassIcon)`
    color: var(--dnd-indicator);
`;

export const StyledMonitorAccount = styled(MonitorAccount)<{ $onWidget?: boolean }>`
    flex: none;
    margin-left: 0;
    margin-top: 1px;
    fill: rgba(var(--calls-bg-rgb), 0.56);
    width: 18px;

    ${({$onWidget}) => $onWidget && css`
        fill: var(--center-channel-color-64);
        margin-left: 1px;
        width: 14px;
    `};
`;

const Text = styled.span<{ $onWidget?: boolean }>`
    color: var(--calls-bg);

    ${({$onWidget}) => $onWidget && css`
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--center-channel-color);
    `}
`;
