// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {useIntl} from 'react-intl';
import {LOWER_HAND_ON_UNMUTE_DELAY_MS, STORAGE_CALLS_LOWER_HAND_ON_UNMUTE} from 'src/constants';

import OnOffSettingsSection from './on_off_settings_section';

export default function RaiseHandSettingsSection() {
    const {formatMessage} = useIntl();
    const seconds = LOWER_HAND_ON_UNMUTE_DELAY_MS / 1000;

    return (
        <OnOffSettingsSection
            title={formatMessage({defaultMessage: 'Raise hand settings'})}
            description={formatMessage({defaultMessage: 'Configure your raise hand settings.'})}
            settingTitle={formatMessage({defaultMessage: 'Lower hand when I unmute for more than {seconds, plural, one {# second} other {# seconds}}'}, {seconds})}
            helpText={formatMessage({defaultMessage: 'When enabled, your raised hand will be automatically lowered after you stay unmuted for more than {seconds, plural, one {# second} other {# seconds}}.'}, {seconds})}
            storageKey={STORAGE_CALLS_LOWER_HAND_ON_UNMUTE}
            defaultValue='off'
            inputName='lowerHandOnUnmute'
        />
    );
}
