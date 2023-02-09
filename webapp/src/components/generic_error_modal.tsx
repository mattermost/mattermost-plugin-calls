// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {ComponentProps} from 'react';
import {useIntl, MessageDescriptor} from 'react-intl';
import styled from 'styled-components';
import {ModalHeader} from 'react-bootstrap';

import GenericModal from 'src/components/generic_modal';

type CustomProps = {
    title: MessageDescriptor,
    message: MessageDescriptor,
};

type Props = Partial<ComponentProps<typeof GenericModal>> & CustomProps;
export const IDGenericErrorModal = 'calls_generic_error';

export const GenericErrorModal = (modalProps: Props) => {
    const {formatMessage} = useIntl();

    return (
        <StyledGenericModal
            id={IDGenericErrorModal}
            {...modalProps}
            modalHeaderText={formatMessage(modalProps.title)}
            confirmButtonText={formatMessage({defaultMessage: 'Understood'})}
            handleConfirm={() => null}
            showCancel={false}
            onHide={() => null}
            contentPadding={'48px 32px'}
            components={{
                Header: Header as never,
                FooterContainer,
            }}
        >
            <ColumnContainer>
                <p>{formatMessage(modalProps.message)}</p>
            </ColumnContainer>
        </StyledGenericModal>
    );
};

const StyledGenericModal = styled(GenericModal)`
    width: 512px;
`;

const Header = styled(ModalHeader)`
    display: flex;
    justify-content: center;
`;

const FooterContainer = styled.div`
    display: flex;
    justify-content: center;
`;

const ColumnContainer = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;

    span {
        margin: 8px 0;
    }
`;
