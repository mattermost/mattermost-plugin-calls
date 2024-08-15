import React from 'react';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import {
    EnterprisePill,
    SectionTitle,
    UnavailableSubtitle,
} from 'src/components/admin_console_settings/common';
import {isCloud, isOnPremNotEnterprise, recordingsEnabled, transcriptionsEnabled} from 'src/selectors';
import {untranslatable} from 'src/utils';

export default function CallLiveCaptionsSection(props: {settingsList: React.ReactNode[]}) {
    const {formatMessage} = useIntl();
    const cloud = useSelector(isCloud);
    const restricted = useSelector(isOnPremNotEnterprise);
    const recordingEnabled = useSelector(recordingsEnabled);
    const transcriptionEnabled = useSelector(transcriptionsEnabled);

    if (restricted || cloud) {
        return null;
    }

    const subtitleMsg = recordingEnabled && transcriptionEnabled ? formatMessage({defaultMessage: 'Displays spoken words as text captions during a call. Recordings and transcriptions must be enabled'}) :
        formatMessage({defaultMessage: 'Displays spoken words as text captions during a call. To enable live captions, recordings and transcriptions must be enabled first'});

    const subtitle = recordingEnabled && transcriptionEnabled ? (
        <div className='section-subtitle'>
            {subtitleMsg}
        </div>
    ) : (
        <UnavailableSubtitle className='section-subtitle'>
            {subtitleMsg}
        </UnavailableSubtitle>
    );

    return (
        <div
            className='config-section'
            data-testid={'calls-live-captions-section'}
        >
            <div className='admin-console__wrapper'>
                <div className='admin-console__content'>
                    <div className='section-header'>
                        <SectionTitle className='section-title'>
                            {formatMessage({defaultMessage: 'Live captions'})}
                            {<EnterprisePill>{untranslatable('Enterprise')}</EnterprisePill>}
                        </SectionTitle>
                        {subtitle}
                    </div>
                    { recordingEnabled && transcriptionEnabled &&
                    <div className='section-body'>
                        {props.settingsList}
                    </div>
                    }
                </div>
            </div>
        </div>
    );
}
