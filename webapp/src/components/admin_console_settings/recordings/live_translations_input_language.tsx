// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {ChangeEvent} from 'react';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import {LabelRow, leftCol, rightCol} from 'src/components/admin_console_settings/common';
import manifest from 'src/manifest';
import {
    callsConfig,
    callsConfigEnvOverrides,
    isCloud,
    isOnPremNotEnterprise,
    liveTranslationsEnabled,
    recordingsEnabled,
    transcriptionsEnabled,
} from 'src/selectors';
import {CustomComponentProps} from 'src/types/mattermost-webapp';

const LiveTranslationsLanguage = (props: CustomComponentProps) => {
    const {formatMessage} = useIntl();
    const restricted = useSelector(isOnPremNotEnterprise);
    const cloud = useSelector(isCloud);
    const recordingEnabled = useSelector(recordingsEnabled);
    const transcriptionEnabled = useSelector(transcriptionsEnabled);
    const liveTranslationEnabled = useSelector(liveTranslationsEnabled);
    const config = useSelector(callsConfig);
    const overrides = useSelector(callsConfigEnvOverrides);
    const overridden = 'LiveTranslationsInputLanguage' in overrides;

    if (cloud || restricted || !recordingEnabled || !transcriptionEnabled || !liveTranslationEnabled) {
        return null;
    }

    // Webapp doesn't pass the placeholder setting.
    const placeholder = manifest.settings_schema?.settings.find((e) => e.key === 'LiveTranslationsInputLanguage')?.placeholder || '';

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        props.onChange(props.id, e.target.value);
    };

    // Use the value from config if it's overridden by environment variable
    const value = overridden ? config.LiveTranslationsInputLanguage : props.value;

    const disabled = props.disabled || overridden;

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
                        {formatMessage({defaultMessage: 'Live translations input language'})}
                    </label>
                </LabelRow>
            </div>
            <div className={rightCol}>
                <input
                    data-testid={props.id + 'input'}
                    id={props.id}
                    className={disabled ? 'form-control disabled' : 'form-control'}
                    type={'input'}
                    placeholder={placeholder}
                    value={value}
                    onChange={handleChange}
                    disabled={disabled}
                />
                <div
                    data-testid={props.id + 'help-text'}
                    className='help-text'
                >
                    {formatMessage({defaultMessage: 'The language of the spoken words to be translated. Should be in BCP-47 format (e.g. \'en-US\'). If left empty, automatic language detection will be used.'})}
                </div>

                {overridden &&
                <div className='alert alert-warning'>
                    {formatMessage({defaultMessage: 'This setting has been set through an environment variable. It cannot be changed through the System Console.'})}
                </div>
                }
            </div>
        </div>
    );
};

export default LiveTranslationsLanguage;
