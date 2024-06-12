// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {getLicenseConfig} from 'mattermost-redux/actions/general';
import React, {ChangeEvent, useEffect, useState} from 'react';
import {FormattedMessage} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';
import {requestOnPremTrialLicense, setRTCDEnabled} from 'src/actions';
import {
    EnterprisePill,
    Footer,
    FooterText,
    LabelRow,
    LeftBox,
    leftCol,
    rightCol,
    Text,
    Title,
} from 'src/components/admin_console_settings/common';
import {
    IDOnPremTrialError,
    IDOnPremTrialSuccess,
    OnPremTrialError,
    OnPremTrialSuccess,
} from 'src/components/admin_console_settings/rtcd_service_url/modals';
import {PrimaryButton} from 'src/components/buttons';
import {HorizontalSpacer, VerticalSpacer} from 'src/components/shared';
import manifest from 'src/manifest';
import {adminStats, isCloud, isOnPremNotEnterprise} from 'src/selectors';
import {CustomComponentProps} from 'src/types/mattermost-webapp';
import {untranslatable} from 'src/utils';
import {modals} from 'src/webapp_globals';

const RTCDServiceUrl = (props: CustomComponentProps) => {
    const dispatch = useDispatch();
    const restricted = useSelector(isOnPremNotEnterprise);
    const cloud = useSelector(isCloud);
    const stats = useSelector(adminStats);

    const [enabled, setEnabled] = useState(() => !restricted && props.value?.length > 0);

    // Update global state with a local state change, or props change (eg, remounting)
    useEffect(() => {
        dispatch(setRTCDEnabled(enabled));
    }, [dispatch, enabled]);

    // Webapp doesn't pass the placeholder setting.
    const placeholder = manifest.settings_schema?.settings.find((e) => e.key === 'RTCDServiceURL')?.placeholder || '';

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        props.onChange(props.id, e.target.value);
        setEnabled(e.target.value.length > 0);
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
            dispatch(getLicenseConfig());
        }
    };

    if (restricted) {
        return (
            <div
                data-testid={props.id}
                className='form-group'
            >
                <div className={'control-label ' + leftCol}>
                    <LabelRow>
                        {props.label}
                        <HorizontalSpacer $size={8}/>
                        <EnterprisePill>{untranslatable('Enterprise')}</EnterprisePill>
                    </LabelRow>
                </div>
                <div className={rightCol}>
                    <LeftBox>
                        <Title>
                            <FormattedMessage
                                defaultMessage={'Use your own WebRTC service for calls and media processing'}
                            />
                        </Title>
                        <VerticalSpacer $size={8}/>
                        <Text>
                            <FormattedMessage
                                defaultMessage={'Real-time communication daemon is a service built to offload calls onto your own WebRTC services and efficiently support scalable and secure deployments. <featureLink>Learn more about this feature</featureLink>.'}
                                values={{
                                    featureLink: (text: string) => (
                                        <a
                                            href='https://docs.mattermost.com/configure/calls-deployment.html'
                                            target='_blank'
                                            rel='noreferrer'
                                        >
                                            {text}
                                        </a>),
                                }}
                            />
                        </Text>
                        <VerticalSpacer $size={16}/>
                        <Footer>
                            <div>
                                <PrimaryButton onClick={requestLicense}>
                                    <FormattedMessage defaultMessage={'Try free for 30 days'}/>
                                </PrimaryButton>
                            </div>
                            <HorizontalSpacer $size={16}/>
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
                        <>
                            <HorizontalSpacer $size={8}/>
                            <EnterprisePill>{untranslatable('Enterprise')}</EnterprisePill>
                        </>
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

export default RTCDServiceUrl;
