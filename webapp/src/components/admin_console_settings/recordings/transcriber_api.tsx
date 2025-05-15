// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {ChangeEvent, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';
import {setTranscribeAPI} from 'src/actions';
import {LabelRow, leftCol, rightCol} from 'src/components/admin_console_settings/common';
import manifest from 'src/manifest';
import {callsConfig, callsConfigEnvOverrides, isCloud, isOnPremNotEnterprise, recordingsEnabled, transcriptionsEnabled} from 'src/selectors';
import {CustomComponentProps} from 'src/types/mattermost-webapp';

const TranscribeAPI = (props: CustomComponentProps) => {
    const {formatMessage} = useIntl();
    const dispatch = useDispatch();
    const restricted = useSelector(isOnPremNotEnterprise);
    const cloud = useSelector(isCloud);
    const hasTranscriptions = useSelector(transcriptionsEnabled);
    const recordingEnabled = useSelector(recordingsEnabled);
    const config = useSelector(callsConfig);
    const overrides = useSelector(callsConfigEnvOverrides);
    const overridden = 'TranscribeAPI' in overrides;

    const [api, setAPI] = useState(() => props.value);

    // Update global state with a local state change, or props change (eg, remounting)
    useEffect(() => {
        if (api) {
            dispatch(setTranscribeAPI(api));
        }
    }, [dispatch, api]);

    if (cloud || restricted || !hasTranscriptions || !recordingEnabled) {
        return null;
    }

    // Webapp doesn't pass the options
    const rawOptions = manifest.settings_schema?.settings.find((e) => e.key === 'TranscribeAPI')?.options || [];
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
        setAPI(e.target.value);
    };

    // Use the value from config if it's overridden by environment variable
    const value = overridden ? config.TranscribeAPI : props.value;

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
                        {formatMessage({defaultMessage: 'Call transcriber API'})}
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
                    {formatMessage({defaultMessage: 'The speech-to-text API to use for post-call transcriptions.'})}
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

export default TranscribeAPI;
