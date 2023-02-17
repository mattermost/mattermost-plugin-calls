import React, {ComponentProps} from 'react';
import {ModalHeader} from 'react-bootstrap';
import {useDispatch} from 'react-redux';
import styled from 'styled-components';

import GenericModal from 'src/components/generic_modal';
import LaptopAlertSVG from 'src/components/icons/laptop_alert_svg';
import {
    rtcPeerErr,
    rtcPeerCloseErr,
    insecureContextErr,
} from 'src/client';

type CustomProps = {
    channelID?: string,
    err: Error,
};

type Props = Partial<ComponentProps<typeof GenericModal>> & CustomProps;

export const CallErrorModalID = 'call-error-modal';

export const CallErrorModal = (props: Props) => {
    const dispatch = useDispatch();

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
        <React.Fragment>
            {' Check the '}
            <a
                href='https://docs.mattermost.com/channels/make-calls.html#troubleshooting'
                onClick={onTroubleShootingClick}
            >{'troubleshooting section'}</a>
            {' if the problem persists.'}
        </React.Fragment>
    );

    const genericMsg = (
        <span>
            {'Looks like something went wrong with calls. You can restart the app and try again.'}
            {troubleShootingMsg}
        </span>
    );
    const genericHeaderMsg = (
        <span>
            {'Something went wrong with calls'}
        </span>
    );

    let msg = genericMsg;
    let headerMsg = genericHeaderMsg;
    let confirmMsg = 'Okay';

    switch (props.err.message) {
    case rtcPeerErr.message:
    case rtcPeerCloseErr.message:
        headerMsg = (
            <span>{'Connection failed'}</span>
        );
        msg = (
            <span>
                {'There was an error with the connection to the call. Try to '}
                <a
                    href=''
                    onClick={onRejoinClick}
                >{'re-join'}</a>
                {' the call.'}
                {troubleShootingMsg}
            </span>
        );
        break;
    case insecureContextErr.message:
        headerMsg = (
            <ColumnContainer>
                <LaptopAlertSVG
                    width={150}
                    height={150}
                />
                <span>{'Calls can\'t be initiated in an insecure context'}</span>
            </ColumnContainer>
        );
        msg = (
            <span>
                {'You need to be using an HTTPS connection to make calls. Visit the documentation for more information.'}
            </span>
        );
        modalProps.showCancel = true;
        modalProps.cancelButtonText = 'Cancel';
        confirmMsg = 'Learn more';
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
            contentPadding={'48px 32px'}
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

const Header = styled(ModalHeader)`
    display: flex;
    justify-content: center;
`;

const FooterContainer = styled.div`
    display: flex;
    justify-content: center;
    gap: 8px;
`;

const StyledGenericModal = styled(GenericModal)`
    width: 512px;
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
