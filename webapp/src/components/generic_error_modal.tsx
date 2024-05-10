// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {ComponentProps} from 'react';
import {ModalHeader} from 'react-bootstrap';
import {MessageDescriptor, useIntl} from 'react-intl';
import GenericModal from 'src/components/generic_modal';
import styled from 'styled-components';

type CustomProps = {
    title: MessageDescriptor,
    message: MessageDescriptor,
    confirmText?: MessageDescriptor,
};

type Props = Partial<ComponentProps<typeof GenericModal>> & CustomProps;
export const IDGenericErrorModal = 'calls_generic_error';

export const GenericErrorModal = (modalProps: Props) => {
    const {formatMessage} = useIntl();
    const confirmText = modalProps.confirmText ? formatMessage(modalProps.confirmText) : formatMessage({defaultMessage: 'Understood'});

    return (
        <StyledGenericModal
            id={IDGenericErrorModal}
            {...modalProps}
            modalHeaderText={formatMessage(modalProps.title)}
            confirmButtonText={confirmText}
            handleConfirm={() => null}
            showCancel={false}
            onHide={() => null}
            contentPadding={'4px 32px 24px 32px'}
            components={{
                Header: Header as never,
                FooterContainer,
            }}
        >
            <ColumnContainer>
                {formatMessage(modalProps.message)}
            </ColumnContainer>
        </StyledGenericModal>
    );
};

export const StyledGenericModal = styled(GenericModal)`
    width: 512px;

    // to override GenricModal's specificity
    &&& {
        .close {
            margin: 0;
        }
    }
`;

export const Header = styled(ModalHeader)`
    display: flex;
    justify-content: center;
`;

export const FooterContainer = styled.div`
    display: flex;
    justify-content: center;
    gap: 8px;
`;

export const ColumnContainer = styled.div`
    display: flex;
    flex-direction: column;

    span {
        margin: 8px 0;
    }
`;
