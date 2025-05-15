// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {TranscribeAPI} from '@mattermost/calls-common/lib/types';
import React, {ChangeEvent} from 'react';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import {LabelRow, leftCol, rightCol} from 'src/components/admin_console_settings/common';
import manifest from 'src/manifest';
import {callsConfig, callsConfigEnvOverrides, isCloud, isOnPremNotEnterprise, recordingsEnabled, transcribeAPI, transcriptionsEnabled} from 'src/selectors';
import {CustomComponentProps} from 'src/types/mattermost-webapp';

const TranscriberModelSize = (props: CustomComponentProps) => {
    const {formatMessage} = useIntl();
    const restricted = useSelector(isOnPremNotEnterprise);
    const cloud = useSelector(isCloud);
    const hasTranscriptions = useSelector(transcriptionsEnabled);
    const recordingEnabled = useSelector(recordingsEnabled);
    const api = useSelector(transcribeAPI);
    const config = useSelector(callsConfig);
    const overrides = useSelector(callsConfigEnvOverrides);
    const overridden = 'TranscriberModelSize' in overrides;

    if (cloud || restricted || !hasTranscriptions || !recordingEnabled || api !== TranscribeAPI.WhisperCPP) {
        return null;
    }

    // Webapp doesn't pass the options
    const rawOptions = manifest.settings_schema?.settings.find((e) => e.key === 'TranscriberModelSize')?.options || [];
    const options = [];
    for (const {display_name, value} of rawOptions) {
        options.push(
            <option
                value={value}
                key={value}
            >
                {display_name}
            </option>,
        );
    }

    const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
        props.onChange(props.id, e.target.value);
    };

    // Use the value from config if it's overridden by environment variable
    const value = overridden ? config.TranscriberModelSize : (props.value ?? 'base');

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
                        {formatMessage({defaultMessage: 'Call transcriber model size'})}
                    </label>
                </LabelRow>
            </div>
            <div className={rightCol}>
                <select
                    data-testid={props.id + 'dropdown'}
                    className={disabled ? 'form-control disabled' : 'form-control'}
                    id={props.id}
                    value={value}
                    onChange={handleChange}
                    disabled={disabled}
                >
                    {options}
                </select>
                <div
                    data-testid={props.id + 'help-text'}
                    className='help-text'
                >
                    {formatMessage({defaultMessage: 'The speech-to-text model size to use for post-call transcriptions. Heavier models will produce more accurate results at the expense of processing time and resources usage.'})}
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

export default TranscriberModelSize;
