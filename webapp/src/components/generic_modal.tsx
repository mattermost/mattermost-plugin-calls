// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import classNames from 'classnames';
import React from 'react';
import {Modal, ModalHeader} from 'react-bootstrap';
import {FormattedMessage} from 'react-intl';
import {DestructiveButton, PrimaryButton, TertiaryButton} from 'src/components/buttons';
import styled from 'styled-components';

type Props = {
    className?: string;
    onHide: () => void;
    onExited?: () => void;
    modalHeaderText?: React.ReactNode;
    show?: boolean;
    showCancel?: boolean;
    handleCancel?: (() => void) | null;
    handleConfirm?: (() => void) | null;
    confirmButtonText?: React.ReactNode;
    confirmButtonClassName?: string;
    cancelButtonText?: React.ReactNode;
    isConfirmDisabled?: boolean;
    isConfirmDestructive?: boolean;
    id: string;
    autoCloseOnCancelButton?: boolean;
    autoCloseOnConfirmButton?: boolean;
    enforceFocus?: boolean;
    footer?: React.ReactNode;
    components?: Partial<{
        Header: typeof ModalHeader;
        FooterContainer: typeof DefaultFooterContainer;
    }>;
    children?: React.ReactNode;
    contentPadding?: string,
};

type State = {
    show: boolean;
};

export default class GenericModal extends React.PureComponent<Props, State> {
    static defaultProps: Partial<Props> = {
        id: 'genericModal',
        autoCloseOnCancelButton: true,
        autoCloseOnConfirmButton: true,
        enforceFocus: true,
    };

    state = {show: true};

    onHide = () => {
        this.setState({show: false}, () => {
            setTimeout(this.props.onHide, 150);
        });
    };

    handleCancel = (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
        event.preventDefault();
        if (this.props.autoCloseOnCancelButton) {
            this.onHide();
        }
        this.props.handleCancel?.();
    };

    handleConfirm = (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
        event.preventDefault();
        if (this.props.autoCloseOnConfirmButton) {
            this.onHide();
        }

        this.props.handleConfirm?.();
    };

    render() {
        let confirmButton;
        if (this.props.handleConfirm) {
            let confirmButtonText: React.ReactNode = <FormattedMessage defaultMessage='Confirm'/>;
            if (this.props.confirmButtonText) {
                confirmButtonText = this.props.confirmButtonText;
            }

            const ButtonComponent = this.props.isConfirmDestructive ? DestructiveButton : PrimaryButton;

            confirmButton = (
                <ButtonComponent
                    type='submit'
                    data-testid={'modal-confirm-button'}
                    className={classNames('confirm', this.props.confirmButtonClassName, {
                        disabled: this.props.isConfirmDisabled,
                    })}
                    onClick={this.handleConfirm}
                    disabled={this.props.isConfirmDisabled}
                >
                    {confirmButtonText}
                </ButtonComponent>
            );
        }

        let cancelButton;
        if (this.props.handleCancel || this.props.showCancel) {
            let cancelButtonText: React.ReactNode = <FormattedMessage defaultMessage='Cancel'/>;
            if (this.props.cancelButtonText) {
                cancelButtonText = this.props.cancelButtonText;
            }

            cancelButton = (
                <TertiaryButton
                    data-testid={'modal-cancel-button'}
                    type='button'
                    className='cancel'
                    onClick={this.handleCancel}
                >
                    {cancelButtonText}
                </TertiaryButton>
            );
        }

        const Header = this.props.components?.Header || Modal.Header;
        const FooterContainer = this.props.components?.FooterContainer || DefaultFooterContainer;

        return (
            <StyledModal
                dialogClassName={classNames('a11y__modal', this.props.className)}
                show={this.props.show ?? this.state.show}
                onHide={this.onHide}
                onExited={this.props.onExited || this.onHide}
                enforceFocus={this.props.enforceFocus}
                restoreFocus={true}
                role='dialog'
                aria-labelledby={`${this.props.id}_heading`}
                id={this.props.id}
                $contentPadding={this.props.contentPadding || '0px'}
            >
                <Header
                    className='GenericModal__header'
                    closeButton={true}
                >
                    {Boolean(this.props.modalHeaderText) && (
                        <h1
                            className='modal-title'
                            id={`${this.props.id}_heading`}
                        >
                            {this.props.modalHeaderText}
                        </h1>
                    )}
                </Header>
                <form>
                    <Modal.Body>{this.props.children}</Modal.Body>
                    <Modal.Footer>
                        <FooterContainer>
                            {cancelButton}
                            {confirmButton}
                            {this.props.footer}
                        </FooterContainer>
                    </Modal.Footer>
                </form>
            </StyledModal>
        );
    }
}

export const StyledModal = styled(Modal)<{ $contentPadding: string}>`
    &&& {
        .modal-body {
            overflow: visible;
        }

        .modal-dialog {
          margin-top: 0 !important;
          top: calc(50% - 24px);
          transform: translateY(-50%);
        }
    }

    z-index: 1040;

    &&&& {
        /* control correction-overrides */

        .form-control {
            border: none;
        }

        input.form-control {
            padding-left: 16px;
        }
    }
`;

export const DefaultFooterContainer = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 20px;
`;

export const ModalHeading = styled.h1`
    font-size: 22px;
    line-height: 28px;
    color: var(--center-channel-color);
    width: 100%;
`;
