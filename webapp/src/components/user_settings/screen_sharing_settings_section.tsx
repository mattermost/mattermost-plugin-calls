// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {useIntl} from 'react-intl';
import {STORAGE_CALLS_SHARE_AUDIO_WITH_SCREEN} from 'src/constants';

import OnOffSettingsSection from './on_off_settings_section';

export default function ScreenSharingSettingsSection() {
    const {formatMessage} = useIntl();

    return (
        <OnOffSettingsSection
            title={formatMessage({defaultMessage: 'Screen sharing settings'})}
            description={formatMessage({defaultMessage: 'Configure your screen sharing settings.'})}
            settingTitle={formatMessage({defaultMessage: 'Share sound with screen'})}
            helpText={formatMessage({defaultMessage: 'When enabled, audio from your browser tab or system (depending on what\'s shared) will be included with the screen content.'})}
            storageKey={STORAGE_CALLS_SHARE_AUDIO_WITH_SCREEN}
            defaultValue='on'
            inputName='enableAudioSharing'
        />
    );
}
