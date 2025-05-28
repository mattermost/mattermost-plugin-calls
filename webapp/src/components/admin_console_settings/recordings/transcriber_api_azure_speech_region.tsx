// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {TranscribeAPI} from '@mattermost/calls-common/lib/types';
import React, {ChangeEvent} from 'react';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import {LabelRow, leftCol, rightCol} from 'src/components/admin_console_settings/common';
import {
    callsConfig,
    callsConfigEnvOverrides,
    isCloud,
    isOnPremNotEnterprise,
    recordingsEnabled,
    transcribeAPI,
    transcriptionsEnabled,
} from 'src/selectors';
import {CustomComponentProps} from 'src/types/mattermost-webapp';

const TranscribeAPIAzureSpeechRegion = (props: CustomComponentProps) => {
    const {formatMessage} = useIntl();
    const restricted = useSelector(isOnPremNotEnterprise);
    const cloud = useSelector(isCloud);
    const recordingEnabled = useSelector(recordingsEnabled);
    const transcriptionEnabled = useSelector(transcriptionsEnabled);
    const api = useSelector(transcribeAPI);
    const config = useSelector(callsConfig);
    const overrides = useSelector(callsConfigEnvOverrides);
    const overridden = 'TranscribeAPIAzureSpeechRegion' in overrides;

    if (cloud || restricted || !recordingEnabled || !transcriptionEnabled || api !== TranscribeAPI.AzureAI) {
        return null;
    }

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        props.onChange(props.id, e.target.value);
    };

    // Use the value from config if it's overridden by environment variable
    const value = overridden ? config.TranscribeAPIAzureSpeechRegion : props.value;

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
                        {formatMessage({defaultMessage: 'Azure API Region'})}
                    </label>
                </LabelRow>
            </div>
            <div className={rightCol}>
                <input
                    data-testid={props.id + 'input'}
                    id={props.id}
                    className={disabled ? 'form-control disabled' : 'form-control'}
                    type={'input'}
                    value={value}
                    onChange={handleChange}
                    disabled={disabled}
                />
                <div
                    data-testid={props.id + 'help-text'}
                    className='help-text'
                >
                    {formatMessage({defaultMessage: 'The API region for Azure Speech Services'})}
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

export default TranscribeAPIAzureSpeechRegion;
