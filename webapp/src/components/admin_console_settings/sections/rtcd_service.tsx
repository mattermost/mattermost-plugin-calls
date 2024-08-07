import {getLicenseConfig} from 'mattermost-redux/actions/general';
import React from 'react';
import {FormattedMessage, useIntl} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';
import {requestOnPremTrialLicense} from 'src/actions';
import {
    EnterprisePill,
    Footer,
    FooterText,
    SectionTitle,
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
import {adminStats, isCloud, isOnPremNotEnterprise} from 'src/selectors';
import {untranslatable} from 'src/utils';
import {modals} from 'src/webapp_globals';

export default function RTCDServiceSection(props: {settingsList: React.ReactNode[]}) {
    const {formatMessage} = useIntl();
    const dispatch = useDispatch();
    const stats = useSelector(adminStats);
    const restricted = useSelector(isOnPremNotEnterprise);
    const cloud = useSelector(isCloud);

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
            <div className='config-section'>
                <div className='admin-console__wrapper'>
                    <div className='admin-console__content'>
                        <div className='section-body'>
                            <Title>
                                <FormattedMessage
                                    defaultMessage={'Use your own WebRTC service'}
                                />
                                <EnterprisePill>{untranslatable('Enterprise')}</EnterprisePill>
                            </Title>
                            <VerticalSpacer $size={8}/>
                            <Text>
                                <FormattedMessage
                                    defaultMessage={'Real-time communication daemon is a service built to offload calls onto your own WebRTC services and efficiently support scalable and secure deployments. <featureLink>Learn more about this feature</featureLink>.'}
                                    values={{
                                        featureLink: (text: string) => (
                                            <a
                                                href='https://mattermost.com/pl/calls-deployment-the-rtcd-service?utm_source=mattermost&utm_medium=in-product&utm_content=calls_rtcd_feature_discovery'
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
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            className='config-section'
            data-testid={'calls-rtcd-service-section'}
        >
            <div className='admin-console__wrapper'>
                <div className='admin-console__content'>
                    <div className='section-header'>
                        <SectionTitle className='section-title'>
                            {formatMessage({defaultMessage: 'RTCD Service'})}
                            {!cloud && <EnterprisePill>{untranslatable('Enterprise')}</EnterprisePill>}
                        </SectionTitle>
                        <div className='section-subtitle'>
                            {formatMessage({defaultMessage: 'Configure a dedicated service used to offload calls and efficiently support scalable and secure deployments'})}
                        </div>
                    </div>
                    <div className='section-body'>
                        {props.settingsList}
                    </div>
                </div>
            </div>
        </div>
    );
}
