// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {ClientError} from '@mattermost/client';
import {ConnectionError, ConnectionErrorReason} from 'livekit-client';
import React, {ComponentProps} from 'react';
import {FormattedMessage, useIntl} from 'react-intl';
import {
    HostRemovedYouFromCallErr,
    insecureContextErr,
    JOIN_DENIED_MSGS,
    userLeftChannelErr,
    userRemovedFromChannelErr,
} from 'src/components/error_modal/error_messages';
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

export const IdForErrorModel = 'call-error-modal';

export const ErrorModal = (props: Props) => {
    const {formatMessage} = useIntl();

    if (!props.err) {
        return null;
    }

    const modalProps = {
        ...props,
    };

    const onConfirm = () => {
        if (props.err.message === insecureContextErr.message) {
            window.open('https://mattermost.com/pl/calls-deployment?utm_source=mattermost&utm_medium=in-product&utm_content=calls_error_modal', '_blank');
        }
        return null;
    };

    const onTroubleShootingClick = (ev: React.MouseEvent) => {
        ev.preventDefault();
        window.open('https://mattermost.com/pl/calls-make-troubleshooting?utm_source=mattermost&utm_medium=in-product&utm_content=calls_error_modal', '_blank');
    };

    const troubleShootingMsg = (
        <>
            {formatMessage(
                {
                    defaultMessage: 'Check the <troubleShootingLink>troubleshooting section</troubleShootingLink> if the problem persists.',
                },
                {
                    troubleShootingLink: (text: React.ReactNode) => (
                        <a
                            href='https://mattermost.com/pl/calls-make-troubleshooting?utm_source=mattermost&utm_medium=in-product&utm_content=calls_error_modal'
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

    // Any failure to establish the LiveKit connection, whatever the underlying reason.
    if (props.err instanceof ConnectionError) {
        headerMsg = (
            <span>{formatMessage({defaultMessage: 'Call connection failed'})}</span>
        );
        const isNetworkReason = props.err.reason === ConnectionErrorReason.ServerUnreachable ||
            props.err.reason === ConnectionErrorReason.Timeout ||
            props.err.reason === ConnectionErrorReason.WebSocket;
        msg = (
            <span>
                {isNetworkReason ? formatMessage({defaultMessage: 'We couldn\'t connect to the call. Please check your network connection and try again.'}) : formatMessage({defaultMessage: 'We couldn\'t connect to the call. Please try again.'})}
                {untranslatable(' ')}
                {troubleShootingMsg}
            </span>
        );
    }

    // The join API's 4xx denials arrive as ClientErrors carrying the server's text.
    const joinDenied = props.err instanceof ClientError && (props.err.status_code === 400 || props.err.status_code === 403) ? props.err.message : '';
    const joinDeniedHeaderMsg = (
        <span>{formatMessage({defaultMessage: 'Unable to join call'})}</span>
    );

    switch (joinDenied) {
    case JOIN_DENIED_MSGS.forbidden:
    case JOIN_DENIED_MSGS.insufficientPermissions:
        headerMsg = joinDeniedHeaderMsg;
        msg = (
            <span>{formatMessage({defaultMessage: 'You don\'t have permission to start or join calls in this channel.'})}</span>
        );
        break;
    case JOIN_DENIED_MSGS.channelDisabled:
        headerMsg = joinDeniedHeaderMsg;
        msg = (
            <span>{formatMessage({defaultMessage: 'Calls are disabled in this channel.'})}</span>
        );
        break;
    case JOIN_DENIED_MSGS.atCapacity:
        headerMsg = joinDeniedHeaderMsg;
        msg = (
            <span>{formatMessage({defaultMessage: 'This call has reached its maximum number of participants.'})}</span>
        );
        break;
    case JOIN_DENIED_MSGS.groupCallsUnlicensed:
        headerMsg = joinDeniedHeaderMsg;
        msg = (
            <span>{formatMessage({defaultMessage: 'Calls in group channels require a licensed server. Calls are only available in direct messages.'})}</span>
        );
        break;
    case JOIN_DENIED_MSGS.callEnded:
        headerMsg = joinDeniedHeaderMsg;
        msg = (
            <span>{formatMessage({defaultMessage: 'This call has already ended.'})}</span>
        );
        break;
    case JOIN_DENIED_MSGS.channelArchived:
        headerMsg = joinDeniedHeaderMsg;
        msg = (
            <span>{formatMessage({defaultMessage: 'Calls can\'t be joined in an archived channel.'})}</span>
        );
        break;
    }

    switch (props.err.message) {
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
    case HostRemovedYouFromCallErr.message:
        headerMsg = (
            <FormattedMessage defaultMessage='You were removed from the call'/>
        );
        msg = (
            <FormattedMessage defaultMessage='The host removed you from the call.'/>
        );
        confirmMsg = formatMessage({defaultMessage: 'Dismiss'});
        break;
    }

    return (
        <StyledGenericModal
            {...modalProps}
            id={IdForErrorModel}
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
