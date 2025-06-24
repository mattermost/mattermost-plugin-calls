// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {TranscribeAPI} from '@mattermost/calls-common/lib/types';
import React, {ChangeEvent, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';
import {setLiveTranslationsEnabled} from 'src/actions';
import {leftCol, RadioInput, RadioInputLabel, rightCol} from 'src/components/admin_console_settings/common';
import {callsConfig, callsConfigEnvOverrides, isCloud, isOnPremNotEnterprise, recordingsEnabled, transcribeAPI, transcriptionsEnabled} from 'src/selectors';
import {CustomComponentProps} from 'src/types/mattermost-webapp';

export const EnableLiveTranslations = (props: CustomComponentProps) => {
    const dispatch = useDispatch();
    const {formatMessage} = useIntl();
    const restricted = useSelector(isOnPremNotEnterprise);
    const cloud = useSelector(isCloud);
    const recordingEnabled = useSelector(recordingsEnabled);
    const transcriptionEnabled = useSelector(transcriptionsEnabled);
    const api = useSelector(transcribeAPI);
    const config = useSelector(callsConfig);
    const overrides = useSelector(callsConfigEnvOverrides);
    const overridden = 'EnableLiveTranslations' in overrides;

    // @ts-ignore -- this is complaining b/c value is supposed to be string, but... it can be bool!
    const [enabled, setEnabled] = useState(() => props.value === 'true' || props.value === true);

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        props.onChange(props.id, e.target.value === 'true');
        setEnabled(e.target.value === 'true');
    };

    // Update global state with a local state change, or props change (eg, remounting)
    useEffect(() => {
        dispatch(setLiveTranslationsEnabled(enabled));
    }, [dispatch, enabled]);

    // Use the value from config if it's overridden by environment variable
    let checked;
    if (overridden) {
        checked = config.EnableLiveTranslations;
    } else {
        // @ts-ignore val is a boolean, but the signature says 'string'. (being defensive here, just in case)
        checked = props.value === 'true' || props.value === true;
    }

    const disabled = props.disabled || overridden;

    if (cloud || restricted || !recordingEnabled || !transcriptionEnabled || api !== TranscribeAPI.AzureAI) {
        return null;
    }

    return (
        <div
            data-testid={props.id}
            className='form-group'
        >
            <label className={'control-label ' + leftCol}>
                {formatMessage({defaultMessage: 'Enable live translations (Experimental)'})}
            </label>
            <div className={rightCol}>
                <RadioInputLabel $disabled={disabled}>
                    <RadioInput
                        data-testid={props.id + 'true'}
                        type='radio'
                        value='true'
                        id={props.id + 'true'}
                        name={props.id + 'true'}
                        checked={checked}
                        onChange={handleChange}
                        disabled={disabled}
                    />
                    {formatMessage({defaultMessage: 'True'})}
                </RadioInputLabel>
                <RadioInputLabel $disabled={disabled}>
                    <RadioInput
                        data-testid={props.id + 'false'}
                        type='radio'
                        value='false'
                        id={props.id + 'false'}
                        name={props.id + 'false'}
                        checked={!checked}
                        onChange={handleChange}
                        disabled={disabled}
                    />
                    {formatMessage({defaultMessage: 'False'})}
                </RadioInputLabel>
                <div
                    data-testid={props.id + 'help-text'}
                    className='help-text'
                >
                    {formatMessage({defaultMessage: '(Optional) When set to true, live translations are enabled.'})}
                </div>

                {overridden &&
                <div className='alert alert-warning'>
                    {formatMessage({defaultMessage: 'This setting has been set through an environment variable. It cannot be changed through the System Console.'})}
                </div>
                }
            </div>
        </div>);
};

export default EnableLiveTranslations;
