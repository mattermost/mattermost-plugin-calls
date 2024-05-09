// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {ComponentProps} from 'react';
import {useIntl} from 'react-intl';
import GenericModal from 'src/components/generic_modal';
import styled from 'styled-components';

type Props = Partial<ComponentProps<typeof GenericModal>>;
export const IDTestModeUser = 'calls_test_mode_user';

export const CallsInTestModeModal = (modalProps: Props) => {
    const {formatMessage} = useIntl();

    return (
        <SizedGenericModal
            id={IDTestModeUser}
            {...modalProps}
            modalHeaderText={formatMessage({defaultMessage: 'Calls is not currently enabled'})}
            confirmButtonText={formatMessage({defaultMessage: 'Understood'})}
            handleConfirm={() => null}
            showCancel={false}
            onHide={() => null}
            components={{FooterContainer}}
        >
            {formatMessage({defaultMessage: 'Calls are currently running in test mode and only system admins can start them. Reach out directly to your system admin for assistance'})}
        </SizedGenericModal>
    );
};

const SizedGenericModal = styled(GenericModal)`
    width: 512px;
    height: 404px;
    padding: 0;
`;

const FooterContainer = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: center;
`;
