// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {ChangeEvent, useState} from 'react';
import {CustomComponentProps} from 'src/types/mattermost-webapp';
import {useDispatch, useSelector} from 'react-redux';

import styled from 'styled-components';

import {FormattedMessage} from 'react-intl';

import {adminStats, isCloud, isOnPremNotEnterprise} from 'src/selectors';
import {PrimaryButton} from 'src/components/buttons';
import {HorizontalSpacer, VerticalSpacer} from 'src/components/shared';
import {modals} from 'src/webapp_globals';
import {
    IDOnPremTrialError,
    IDOnPremTrialSuccess,
    OnPremTrialError,
    OnPremTrialSuccess,
} from 'src/components/admin_console_settings/rtcd_service_url/modals';
import {requestOnPremTrialLicense} from 'src/actions';
import manifest from 'src/manifest';

const RTCDServiceUrl = (props: CustomComponentProps) => {
    const dispatch = useDispatch();
    const restricted = useSelector(isOnPremNotEnterprise);
    const cloud = useSelector(isCloud);
    const stats = useSelector(adminStats);

    const [currentRestricted, setCurrentRestricted] = useState(restricted);

    const leftCol = 'col-sm-4';
    const rightCol = 'col-sm-8';

    // Webapp doesn't pass the placeholder setting.
    const placeholder = manifest.settings_schema?.settings.find((e) => e.key === 'RTCDServiceURL')?.placeholder || '';

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        props.onChange(props.id, e.target.value);
    };

    const requestLicense = async () => {
        let users = 0;
        if (stats && (typeof stats.TOTAL_USERS === 'number')) {
            users = stats.TOTAL_USERS;
        }
        const requestedUsers = Math.max(users, 30);

        const {error} = await requestOnPremTrialLicense(requestedUsers, true, true);

        if (error) {
            dispatch(modals.openModal({
                modalId: IDOnPremTrialError,
                dialogType: OnPremTrialError,
            }));
        } else {
            dispatch(modals.openModal({
                modalId: IDOnPremTrialSuccess,
                dialogType: OnPremTrialSuccess,
            }));
            setCurrentRestricted(false);
        }
    };

    if (currentRestricted) {
        return (
            <div
                data-testid={props.id}
                className='form-group'
            >
                <div className={'control-label ' + leftCol}>
                    <LabelRow>
                        <span>{props.label}</span>
                        <UpgradePill>{'Enterprise feature'}</UpgradePill>
                    </LabelRow>
                </div>
                <div className={rightCol}>
                    <LeftBox>
                        <Title>
                            <FormattedMessage
                                defaultMessage={'Use your own WebRTC service for calls and media processing'}
                            />
                        </Title>
                        <VerticalSpacer size={8}/>
                        <Text>
                            <FormattedMessage
                                defaultMessage={'Real-time communication daemon is a service built to offload calls onto your own WebRTC services and efficiently support scalable and secure deployments. <featureLink>Learn more about this feature</featureLink>.'}
                                values={{
                                    featureLink: (text: string) => (
                                        <a
                                            href='TODO'
                                            target='_blank'
                                            rel='noreferrer'
                                        >
                                            {text}
                                        </a>),
                                }}
                            />
                        </Text>
                        <VerticalSpacer size={16}/>
                        <Footer>
                            <div>
                                <PrimaryButton onClick={requestLicense}>
                                    <FormattedMessage defaultMessage={'Try free for 30 days'}/>
                                </PrimaryButton>
                            </div>
                            <HorizontalSpacer size={16}/>
                            <FooterText>
                                <FormattedMessage
                                    defaultMessage={'By selecting <b>Try free for 30 days</b>, I agree to the <linkEvaluation>Mattermost Software Evaluation Agreement</linkEvaluation>, <linkPrivacy>Privacy Policy</linkPrivacy>, and receiving product emails.'}
                                    values={{
                                        b: (text: string) => <b>{text}</b>,
                                        linkEvaluation: (text: string) => (
                                            <a
                                                href='https://mattermost.com/software-evaluation-agreement'
                                                target='_blank'
                                                rel='noreferrer'
                                            >
                                                {text}
                                            </a>
                                        ),
                                        linkPrivacy: (text: string) => (
                                            <a
                                                href='https://mattermost.com/privacy-policy/'
                                                target='_blank'
                                                rel='noreferrer'
                                            >
                                                {text}
                                            </a>
                                        ),
                                    }}
                                />
                            </FooterText>
                        </Footer>
                    </LeftBox>
                </div>
            </div>
        );
    }

    return (
        <div
            data-testid={props.id}
            className='form-group'
        >
            <div className={'control-label ' + leftCol}>
                <LabelRow>
                    <label
                        data-testid={props.id + 'label'}
                        htmlFor={props.id}
                    >
                        {props.label}
                    </label>
                    {!cloud &&
                        <EnterprisePill>{'Enterprise feature'}</EnterprisePill>
                    }
                </LabelRow>
            </div>
            <div className={rightCol}>
                <input
                    data-testid={props.id + 'input'}
                    id={props.id}
                    className='form-control'
                    type={'input'}
                    placeholder={placeholder}
                    value={props.value}
                    onChange={handleChange}
                    disabled={props.disabled}
                />
                <div
                    data-testid={props.id + 'help-text'}
                    className='help-text'
                >
                    {props.helpText}
                </div>
            </div>
        </div>);
};

const LabelRow = styled.div`
    display: flex;
`;

const UpgradePill = styled.div`
    position: relative;
    display: flex;
    align-items: center;
    padding: 3px 8px 3px 22px;
    margin-left: 8px;
    background: var(--button-bg);
    border-radius: 10px;
    height: 20px;

    font-size: 10px;
    font-weight: 600;
    line-height: 15px;
    color: var(--center-channel-bg);

    &:before {
        left: 7px;
        top: 3px;
        position: absolute;
        content: '\f030b';
        font-size: 12px;
        font-family: 'compass-icons', mattermosticons;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
    }
`;

const EnterprisePill = styled(UpgradePill)`
    background: rgba(var(--button-bg-rgb), 0.16);
    color: var(--button-bg);

    &:before {
        content: '\f140c';
    }
`;

const LeftBox = styled.div`
    display: flex;
    flex-direction: column;
    padding: 24px;
    max-width: 584px;
    background: var(--center-channel-bg);
    box-shadow: 0 2px 3px rgba(0, 0, 0, 0.08);
    border-radius: 4px;
`;

const Title = styled.div`
    font-family: 'Metropolis', sans-serif;
    font-weight: 600;
    font-size: 16px;
    line-height: 24px;
    color: var(--center-channel-text);
`;

const Text = styled.div`
    font-family: 'Open Sans', sans-serif;
    font-weight: 400;
    font-size: 12px;
    line-height: 16px;
    color: var(--center-channel-text);
`;

const Footer = styled.div`
    display: flex;
`;

const FooterText = styled.div`
    font-family: 'Open Sans', sans-serif;
    font-weight: 400;
    font-size: 10px;
    line-height: 16px;
    color: rgba(var(--center-channel-text-rgb), 0.72);
`;

export default RTCDServiceUrl;
