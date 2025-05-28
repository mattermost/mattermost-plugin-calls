// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {ChangeEvent} from 'react';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import {LabelRow, leftCol, rightCol} from 'src/components/admin_console_settings/common';
import {callsConfig, callsConfigEnvOverrides, isCloud, isOnPremNotEnterprise, recordingsEnabled} from 'src/selectors';
import {CustomComponentProps} from 'src/types/mattermost-webapp';

const RecordingQuality = (props: CustomComponentProps) => {
    const {formatMessage} = useIntl();
    const restricted = useSelector(isOnPremNotEnterprise);
    const cloud = useSelector(isCloud);
    const recordingEnabled = useSelector(recordingsEnabled);
    const config = useSelector(callsConfig);
    const overrides = useSelector(callsConfigEnvOverrides);
    const overridden = 'RecordingQuality' in overrides;

    if (cloud || restricted || !recordingEnabled) {
        return null;
    }

    const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
        props.onChange(props.id, e.target.value);
    };

    // Use the value from config if it's overridden by environment variable
    const value = overridden ? config.RecordingQuality : (props.value ?? 'medium');

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
                        {formatMessage({defaultMessage: 'Call recording quality'})}
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
                    <option
                        key='low'
                        value='low'
                    >
                        {formatMessage({defaultMessage: 'Low'})}
                    </option>
                    <option
                        key='medium'
                        value='medium'
                    >
                        {formatMessage({defaultMessage: 'Medium'})}
                    </option>
                    <option
                        key='high'
                        value='high'
                    >
                        {formatMessage({defaultMessage: 'High'})}
                    </option>
                </select>
                <div
                    data-testid={props.id + 'help-text'}
                    className='help-text'
                >
                    {formatMessage({defaultMessage: 'The audio and video quality of call recordings.\n Note: this setting can affect the overall performance of the job service and the number of concurrent recording jobs that can be run.'})}
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

export default RecordingQuality;
