import React, {ComponentProps} from 'react';
import {useIntl} from 'react-intl';
import {endCall} from 'src/actions';
import GenericModal from 'src/components/generic_modal';
import styled from 'styled-components';

export const IDEndCallConfirmation = 'end_call_confirmation';

type Props = Partial<ComponentProps<typeof GenericModal>> & {
    channelID: string;
};

export const EndCallConfirmation = ({channelID, ...modalProps}: Props) => {
    const {formatMessage} = useIntl();

    const title = formatMessage({defaultMessage: 'End call for everyone'});
    const body = formatMessage({defaultMessage: 'The call will end and all its participants will be disconnected. Are you sure you want to end the call?'});
    const cancelText = formatMessage({defaultMessage: 'Cancel'});
    const confirmText = formatMessage({defaultMessage: 'End call'});

    return (
        <SizedGenericModal
            id={IDEndCallConfirmation}
            {...modalProps}
            modalHeaderText={title}
            confirmButtonText={confirmText}
            cancelButtonText={cancelText}
            isConfirmDestructive={true}
            handleConfirm={() => endCall(channelID)}
            showCancel={true}
            onHide={() => null}
            components={{FooterContainer}}
        >
            {body}
        </SizedGenericModal>
    );
};

const SizedGenericModal = styled(GenericModal)`
    width: 512px;
    height: 204px;
    padding: 0;
`;

const FooterContainer = styled.div`
    display: flex;
    justify-content: space-between;
    gap: 8px;
`;
