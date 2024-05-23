import React, {ComponentProps} from 'react';
import {defineMessage, useIntl} from 'react-intl';
import {
    insecureContextErr,
    rtcPeerCloseErr,
    rtcPeerErr,
    rtcPeerTimeoutErr,
    userLeftChannelErr,
    userRemovedFromChannelErr,
} from 'src/client';
import {
    ColumnContainer,
    FooterContainer,
    Header,
    StyledGenericModal,
} from 'src/components/generic_error_modal';
import GenericModal from 'src/components/generic_modal';
import LaptopAlertSVG from 'src/components/icons/laptop_alert_svg';
import {untranslatable} from 'src/utils';
import styled from 'styled-components';

type CustomProps = {
    channelID?: string,
    err: Error,
};

type Props = Partial<ComponentProps<typeof GenericModal>> & CustomProps;

export const CallErrorModalID = 'call-error-modal';

export const hostRemovedMsg = 'host-removed';
export const removedMsgTitle = defineMessage({defaultMessage: 'You were removed from the call'});
export const removedMsg = defineMessage({defaultMessage: 'The host removed you from the call.'});
export const removedDismiss = defineMessage({defaultMessage: 'Dismiss'});

export const CallErrorModal = (props: Props) => {
    const {formatMessage} = useIntl();

    if (!props.err) {
        return null;
    }

    const modalProps = {
        ...props,
    };

    const onRejoinClick = (ev: React.MouseEvent) => {
        ev.preventDefault();
        window.postMessage({type: 'connectCall', channelID: props.channelID}, window.origin);
        if (props.onHide) {
            props.onHide();
        }
    };

    const onConfirm = () => {
        if (props.err.message === insecureContextErr.message) {
            window.open('https://docs.mattermost.com/configure/calls-deployment.html', '_blank');
        }
        return null;
    };

    const onTroubleShootingClick = (ev: React.MouseEvent) => {
        ev.preventDefault();
        window.open('https://docs.mattermost.com/channels/make-calls.html#troubleshooting', '_blank');
    };

    const troubleShootingMsg = (
        <>
            {/*@ts-ignore*/}
            {formatMessage(
                {
                    defaultMessage: 'Check the <troubleShootingLink>troubleshooting section</troubleShootingLink> if the problem persists.',
                },
                {
                    troubleShootingLink: (text: string) => (
                        <a
                            href='https://docs.mattermost.com/channels/make-calls.html#troubleshooting'
                            onClick={onTroubleShootingClick}
                        >{text}</a>
                    ),
                })}
        </>
    );

    const genericMsg = (
        <span>
            {formatMessage({defaultMessage: 'Looks like something went wrong with calls. You can restart the app and try again.'})}
            {untranslatable(' ')}
            {troubleShootingMsg}
        </span>
    );
    const genericHeaderMsg = (
        <span>
            {formatMessage({defaultMessage: 'Something went wrong with calls'})}
        </span>
    );

    let msg = genericMsg;
    let headerMsg = genericHeaderMsg;
    let confirmMsg = formatMessage({defaultMessage: 'Okay'});

    switch (props.err.message) {
    case rtcPeerTimeoutErr.message:
        headerMsg = (
            <span>{formatMessage({defaultMessage: 'Call connection failed'})}</span>
        );
        msg = (
            <span>
                {/*@ts-ignore*/}
                {formatMessage({defaultMessage: 'We couldn\'t join the call because the connection timed out. Please check your network connection and try again.'}, {
                    joinLink: (text: string) => (
                        <a
                            href=''
                            onClick={onRejoinClick}
                        >{text}</a>
                    ),
                })}
                {untranslatable(' ')}
                {troubleShootingMsg}
            </span>
        );
        break;
    case rtcPeerErr.message:
    case rtcPeerCloseErr.message:
        headerMsg = (
            <span>{formatMessage({defaultMessage: 'Call connection failed'})}</span>
        );
        msg = (
            <span>
                {/*@ts-ignore*/}
                {formatMessage({defaultMessage: 'There was an error with the connection to the call. Try to <joinLink>re-join</joinLink> the call.'}, {
                    joinLink: (text: string) => (
                        <a
                            href=''
                            onClick={onRejoinClick}
                        >{text}</a>
                    ),
                })}
                {untranslatable(' ')}
                {troubleShootingMsg}
            </span>
        );
        break;
    case insecureContextErr.message:
        headerMsg = (
            <ColumnContainer>
                <LaptopAlertSVGContainer>
                    <LaptopAlertSVG
                        width={150}
                        height={150}
                    />
                </LaptopAlertSVGContainer>
                <span>{formatMessage({defaultMessage: 'Calls can\'t be initiated in an insecure context'})}</span>
            </ColumnContainer>
        );
        msg = (
            <span>
                {formatMessage({defaultMessage: 'You need to be using an HTTPS connection to make calls. Visit the documentation for more information.'})}
            </span>
        );
        modalProps.showCancel = true;
        modalProps.cancelButtonText = formatMessage({defaultMessage: 'Cancel'});
        confirmMsg = formatMessage({defaultMessage: 'Learn more'});
        break;
    case userRemovedFromChannelErr.message:
        headerMsg = (
            <span>{formatMessage({defaultMessage: 'You were removed from the channel'})}</span>
        );
        msg = (
            <span>
                {formatMessage({defaultMessage: 'You have been removed from the channel, and have been disconnected from the call.'})}
            </span>
        );
        break;
    case userLeftChannelErr.message:
        headerMsg = (
            <span>{formatMessage({defaultMessage: 'You left the channel'})}</span>
        );
        msg = (
            <span>
                {formatMessage({defaultMessage: 'You have left the channel, and have been disconnected from the call.'})}
            </span>
        );
        break;
    case hostRemovedMsg:
        headerMsg = (
            <>{formatMessage(removedMsgTitle)}</>
        );
        msg = (
            <>{formatMessage(removedMsg)}</>
        );
        confirmMsg = formatMessage(removedDismiss);
        break;
    }

    return (
        <StyledGenericModal
            {...modalProps}
            id={CallErrorModalID}
            modalHeaderText={headerMsg}
            confirmButtonText={confirmMsg}
            onHide={() => null}
            handleConfirm={onConfirm}
            contentPadding={'4px 32px 24px 32px'}
            components={{
                Header: Header as never,
                FooterContainer,
            }}
        >
            <ColumnContainer>
                {msg}
            </ColumnContainer>
        </StyledGenericModal>
    );
};

const LaptopAlertSVGContainer = styled.div`
    align-self: center;
`;
