// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {ComponentProps} from 'react';
import {FormattedMessage, useIntl} from 'react-intl';
import {
    HostRemovedYouFromCallErr,
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
import {untranslatable} from 'src/utils';

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

    switch (props.err.message) {
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
            handleConfirm={() => null}
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

