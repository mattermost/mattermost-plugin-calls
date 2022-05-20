// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useIntl} from 'react-intl';
import React, {ComponentProps} from 'react';

import styled from 'styled-components';

import {useDispatch, useSelector} from 'react-redux';

import {Thunk} from 'mattermost-redux/types/actions';

import GenericModal from 'src/components/generic_modal';
import {displayCloudPricing, notifyAdminCloudFreeTrial, requestTrial} from 'src/actions';
import RaisedHandsIllustration from 'src/cloud_pricing/raised_hands_illustration';
import UpgradeErrorIllustrationSvg from 'src/cloud_pricing/upgrade_error_illustration_svg';
import {isCloudTrialCompleted} from 'src/selectors';

export const IDUser = 'cloud_free_trial_user';
export const IDAdmin = 'cloud_free_trial_admin';
export const IDSuccess = 'cloud_free_trial_success';
export const IDError = 'cloud_free_trial_failure';

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
            <VerticalSpacer size={22}/>
            <p>{formatMessage({defaultMessage: 'Channel calls give you a quick, audio-first way of interacting with your colleagues. Get the full calls experience when you start a free, 30-day trial.'})}</p>
            <p>{formatMessage({defaultMessage: 'Notify your admin to start your trial today and we will send an automatic request to your admins to start the trial.'})}</p>
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
    let bodyText = formatMessage({defaultMessage: 'Channel calls give you a quick, audio-first way of interacting with your colleagues. Get the full calls experience when you start a free, 30-day trial.'});
    let confirmThunk: Thunk = requestTrial();

    if (trialTaken) {
        headerText = formatMessage({defaultMessage: 'Upgrade to use calls in Channels'});
        confirmButtonText = formatMessage({defaultMessage: 'View plans'});
        bodyText = formatMessage({defaultMessage: 'Channel calls give you a quick, audio-first way of interacting with your colleagues. Upgrade to the Professional Plan to use calls in Channels and Group Messages.'});
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
            <VerticalSpacer size={22}/>
            {bodyText}
        </SizedGenericModal>
    );
};

export const CloudFreeTrialSuccessModal = (modalProps: Props) => {
    const {formatMessage} = useIntl();

    return (
        <SizedGenericModal
            id={IDSuccess}
            {...modalProps}
            confirmButtonText={formatMessage({defaultMessage: 'Done'})}
            handleConfirm={() => null}
            onHide={() => null}
        >
            <div>
                <Centered>
                    <SuccessImage/>
                </Centered>
                <Heading>
                    {formatMessage({defaultMessage: 'Your trial has started!'})}
                    <p>{formatMessage({defaultMessage: 'Explore the benefits of Enterprise'})}</p>
                </Heading>
                {formatMessage({defaultMessage: 'Welcome to your Mattermost Enterprise trial! It expires on August 1st, 2021. You now have access to guest accounts, automated compliance reports, and mobile secure-ID push notifications, among many other features. View all features on our documentation.'})}
            </div>
        </SizedGenericModal>
    );
};

export const CloudFreeTrialErrorModal = (modalProps: Props) => {
    const {formatMessage} = useIntl();

    return (
        <SizedGenericModal
            id={IDError}
            {...modalProps}
            confirmButtonText={formatMessage({defaultMessage: 'Contact Support'})}
            handleConfirm={() => window.open('https://mattermost.com/pricing-cloud')}
            cancelButtonText={formatMessage({defaultMessage: 'Close'})}
            showCancel={true}
            onHide={() => null}
        >
            <div>
                <Centered>
                    <ErrorImage/>
                </Centered>
                <Heading>
                    {formatMessage({defaultMessage: 'We encountered an error'})}
                </Heading>
                <VerticalSpacer size={12}/>
                {formatMessage({defaultMessage: 'Please see the system logs for more information, and contact support.'})}
            </div>
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

const Heading = styled.div`
    font-weight: 600;
    font-size: 22px;
    line-height: 28px;
    text-align: center;
`;

const Centered = styled.div`
    text-align: center;
`;

const VerticalSpacer = styled.div<{ size: number }>`
    margin-top: ${(props) => props.size}px;
`;

const SuccessImage = styled(RaisedHandsIllustration)`
    margin: 32px;
`;

const ErrorImage = styled(UpgradeErrorIllustrationSvg)`
    width: 360px;
`;
