// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {ComponentProps} from 'react';
import {FormattedMessage, useIntl} from 'react-intl';
import {NavLink} from 'react-router-dom';
import styled from 'styled-components';

import HandsSvg from 'mattermost-webapp/components/common/svg_images_components/hands_svg';

import {DateTime} from 'luxon';

import GenericModal from 'src/components/generic_modal';
import {VerticalSpacer} from 'src/components/shared';
import {navigateToURL} from 'src/browser_routing';

export const IDOnPremTrialSuccess = 'onprem_trial_success';
export const IDOnPremTrialError = 'onprem_trial_error';

type Props = Partial<ComponentProps<typeof GenericModal>>;

export const OnPremTrialSuccess = (modalProps: Props) => {
    const {formatMessage} = useIntl();

    // by default all licences last 30 days plus 8 hours.
    const trialEndDate = DateTime.now().plus({days: 30, hours: 8}).toLocaleString(DateTime.DATE_FULL);

    return (
        <StyledModal
            id={IDOnPremTrialSuccess}
            {...modalProps}
            confirmButtonText={formatMessage({defaultMessage: 'Set up RTCD Services'})}
            handleConfirm={() => navigateToURL('/admin_console/plugins/plugin_com.mattermost.calls')}
            onHide={() => null}
        >
            <HandsSvg
                width={110}
                height={100}
            />
            <VerticalSpacer size={32}/>
            <Title>
                <FormattedMessage
                    defaultMessage={'Your trial has started!{br}Explore the benefits of Enterprise'}
                    values={{br: <br/>}}
                />
            </Title>
            <VerticalSpacer size={8}/>
            <Body css={'text-align: left'}>
                <FormattedMessage
                    defaultMessage={'Welcome to your Mattermost Enterprise trial! It expires on {trialExpirationDate}. ' +
                        'You now have access to <rtcdDocsLink>RTCD services</rtcdDocsLink>, ' +
                        '<guestAccountsLink>guest accounts</guestAccountsLink>, ' +
                        '<autoComplianceReportsLink>automated compliance reports</autoComplianceReportsLink>, and ' +
                        '<mobileSecureNotificationsLink>mobile secure-ID push notifications</mobileSecureNotificationsLink>, ' +
                        'among many other features. ' +
                        'View all features in our <documentationLink>documentation</documentationLink>.'}
                    values={{
                        trialExpirationDate: trialEndDate,
                        rtcdDocsLink: (text: string) => (
                            <a
                                href='TODO'
                                target='_blank'
                                rel='noreferrer'
                            >
                                {text}
                            </a>
                        ),
                        guestAccountsLink: (text: string) => (
                            <NavLink
                                to='/admin_console/authentication/guest_access'
                            >
                                {text}
                            </NavLink>
                        ),
                        autoComplianceReportsLink: (text: string) => (
                            <NavLink
                                to='/admin_console/compliance/export'
                            >
                                {text}
                            </NavLink>
                        ),
                        mobileSecureNotificationsLink: (text: string) => (
                            <NavLink
                                to='/admin_console/environment/push_notification_server'
                            >
                                {text}
                            </NavLink>
                        ),
                        documentationLink: (text: string) => (
                            <a
                                href='TODO'
                                target='_blank'
                                rel='noreferrer'
                            >
                                {text}
                            </a>
                        ),
                    }}
                />
            </Body>
        </StyledModal>
    );
};

export const OnPremTrialError = (modalProps: Props) => {
    const {formatMessage} = useIntl();

    return (
        <GenericModal
            id={IDOnPremTrialError}
            {...modalProps}
            confirmButtonText={formatMessage({defaultMessage: 'Okay'})}
            handleConfirm={() => null}
            onHide={() => null}
            components={{FooterContainer}}
        >
            <Title>
                <FormattedMessage defaultMessage={'Something went wrong!'}/>
            </Title>
            <VerticalSpacer size={8}/>
            <Body css={'text-align: center'}>
                <FormattedMessage
                    defaultMessage={'Looks like something went wrong with your Enterprise trial request. ' +
                        'You can try again later or <supportLink>contact support</supportLink> if the error persists.'}
                    values={{
                        supportLink: (text: string) => (
                            <a
                                href='https://mattermost.com/support/'
                                target='_blank'
                                rel='noreferrer'
                            >
                                {text}
                            </a>
                        ),
                    }}
                />
            </Body>
        </GenericModal>
    );
};

const Title = styled.div`
    font-family: 'Metropolis', sans-serif;
    font-style: normal;
    font-weight: 600;
    font-size: 22px;
    line-height: 28px;
    text-align: center;
`;

const Body = styled.div`
    font-family: 'Open Sans', sans-serif;
    font-style: normal;
    font-weight: 400;
    font-size: 14px;
    line-height: 20px;
`;

const FooterContainer = styled.div`
    display: flex;
    justify-content: center;
`;

const StyledModal = styled(GenericModal)`
    text-align: center;
`;
