// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {TranscribeAPI} from '@mattermost/calls-common/lib/types';
import React from 'react';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import {
    EnterprisePill,
    SectionTitle,
    UnavailableSubtitle,
} from 'src/components/admin_console_settings/common';
import {isCloud, isOnPremNotEnterprise, recordingsEnabled, transcribeAPI, transcriptionsEnabled} from 'src/selectors';
import {untranslatable} from 'src/utils';

export default function CallLiveTranslationsSection(props: {settingsList: React.ReactNode[]}) {
    const {formatMessage} = useIntl();
    const cloud = useSelector(isCloud);
    const restricted = useSelector(isOnPremNotEnterprise);
    const recordingEnabled = useSelector(recordingsEnabled);
    const transcriptionEnabled = useSelector(transcriptionsEnabled);
    const api = useSelector(transcribeAPI);

    if (restricted || cloud) {
        return null;
    }

    const enabled = recordingEnabled && transcriptionEnabled && api === TranscribeAPI.AzureAI;

    const subtitleMsg = enabled ? formatMessage({defaultMessage: 'Translates spoken words in real-time. Recordings and transcriptions must be enabled. The only supported transcriber API is Azure AI'}) :
        formatMessage({defaultMessage: 'Translates spoken words in real-time. To enable live translations, recordings and transcriptions must be enabled first and the transcriber API must be set to Azure AI'});

    const subtitle = enabled ? (
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
            data-testid={'calls-live-translations-section'}
        >
            <div className='admin-console__wrapper'>
                <div className='admin-console__content'>
                    <div className='section-header'>
                        <SectionTitle className='section-title'>
                            {formatMessage({defaultMessage: 'Live translations'})}
                            {<EnterprisePill>{untranslatable('Enterprise')}</EnterprisePill>}
                        </SectionTitle>
                        {subtitle}
                    </div>
                    { enabled &&
                    <div className='section-body'>
                        {props.settingsList}
                    </div>
                    }
                </div>
            </div>
        </div>
    );
}
