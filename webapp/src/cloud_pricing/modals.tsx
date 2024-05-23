// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {ComponentProps} from 'react';
import {useIntl} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';
import {displayCloudPricing, notifyAdminCloudFreeTrial} from 'src/actions';
import GenericModal from 'src/components/generic_modal';
import {VerticalSpacer} from 'src/components/shared';
import {isCloudTrialCompleted} from 'src/selectors';
import styled from 'styled-components';

export const IDUser = 'cloud_free_trial_user';
export const IDAdmin = 'cloud_free_trial_admin';

type Props = Partial<ComponentProps<typeof GenericModal>>;

export const CloudFreeTrialModalUser = (modalProps: Props) => {
    const {formatMessage} = useIntl();

    return (
        <SizedGenericModal
            id={IDUser}
            {...modalProps}
            modalHeaderText={formatMessage({defaultMessage: 'Try channel calls with a free trial'})}
            confirmButtonText={formatMessage({defaultMessage: 'Notify admin'})}
            cancelButtonText={formatMessage({defaultMessage: 'Back'})}
            handleConfirm={() => {
                notifyAdminCloudFreeTrial();
            }}
            showCancel={true}
            onHide={() => null}
            components={{FooterContainer}}
        >
            <VerticalSpacer $size={22}/>
            <p>{formatMessage({defaultMessage: 'Calls are a quick, audio-first, way to interact with your team. Get the full calls experience when you start a free, 30-day trial.'})}</p>
            <p>{formatMessage({defaultMessage: 'Select Notify admin to send an automatic request to your system admins to start the trial.'})}</p>
        </SizedGenericModal>
    );
};

export const CloudFreeTrialModalAdmin = (modalProps: Props) => {
    const {formatMessage} = useIntl();
    const dispatch = useDispatch();

    const trialTaken = useSelector(isCloudTrialCompleted);

    // Note: This modal should never be triggered if currently in trial--the calls button will not be feature restricted.
    // So the default is trialNotTaken:
    let headerText = formatMessage({defaultMessage: 'Try channel calls with a free trial'});
    let confirmButtonText = formatMessage({defaultMessage: 'Try free for 30 days'});
    let bodyText = formatMessage({defaultMessage: 'Calls are a quick, audio-first, way to interact with your team. Get the full calls experience when you start a free, 30-day trial.'});
    let confirmThunk = displayCloudPricing();

    if (trialTaken) {
        headerText = formatMessage({defaultMessage: 'Upgrade to use calls in Channels'});
        confirmButtonText = formatMessage({defaultMessage: 'View plans'});
        bodyText = formatMessage({defaultMessage: 'Calls are a quick, audio-first, way to interact with your team. Upgrade to Mattermost Professional to use calls in channels and group messages.'});
        confirmThunk = displayCloudPricing();
    }

    return (
        <SizedGenericModal
            id={IDAdmin}
            {...modalProps}
            modalHeaderText={headerText}
            confirmButtonText={confirmButtonText}
            cancelButtonText={formatMessage({defaultMessage: 'Back'})}
            handleConfirm={() => dispatch(confirmThunk)}
            showCancel={true}
            onHide={() => null}
            components={{FooterContainer}}
        >
            <VerticalSpacer $size={22}/>
            {bodyText}
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
    justify-content: space-between;
`;
