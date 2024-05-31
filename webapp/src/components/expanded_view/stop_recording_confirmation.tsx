import React, {ComponentProps} from 'react';
import {useIntl} from 'react-intl';
import {stopCallRecording} from 'src/actions';
import GenericModal from 'src/components/generic_modal';
import styled from 'styled-components';

export const IDStopRecordingConfirmation = 'stop_recording_confirmation';

type Props = Partial<ComponentProps<typeof GenericModal>> & {
    channelID: string;
};

export const StopRecordingConfirmation = ({channelID, ...modalProps}: Props) => {
    const {formatMessage} = useIntl();

    const stopRecordingText = formatMessage({defaultMessage: 'Stop recording'});
    const bodyText = formatMessage({defaultMessage: 'The call recording will be processed and posted in the call thread. Are you sure you want to stop the recording?'});
    const cancelText = formatMessage({defaultMessage: 'Cancel'});

    return (
        <SizedGenericModal
            id={IDStopRecordingConfirmation}
            {...modalProps}
            modalHeaderText={stopRecordingText}
            confirmButtonText={stopRecordingText}
            cancelButtonText={cancelText}
            isConfirmDestructive={true}
            handleConfirm={() => stopCallRecording(channelID)}
            showCancel={true}
            onHide={() => null}
            components={{FooterContainer}}
        >
            {bodyText}
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
