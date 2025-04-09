// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {ChangeEvent} from 'react';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import {
    LabelRow, leftCol, rightCol, TextInput,
} from 'src/components/admin_console_settings/common';
import {useHelptext} from 'src/components/admin_console_settings/hooks';
import manifest from 'src/manifest';
import {callsConfig, callsConfigEnvOverrides, rtcdEnabled} from 'src/selectors';
import {CustomComponentProps} from 'src/types/mattermost-webapp';

const TCPServerAddress = (props: CustomComponentProps) => {
    const {formatMessage} = useIntl();
    const isRTCDEnabled = useSelector(rtcdEnabled);
    const config = useSelector(callsConfig);
    const overrides = useSelector(callsConfigEnvOverrides);
    const overridden = 'TCPServerAddress' in overrides;
    const helpText = useHelptext(formatMessage({defaultMessage: 'The local IP address used by the RTC server to listen on for TCP connections.'}));

    // Webapp doesn't pass the placeholder setting.
    const placeholder = manifest.settings_schema?.settings.find((e) => e.key === 'TCPServerAddress')?.placeholder || '';

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        props.onChange(props.id, e.target.value);
    };

    // Use the value from config if it's overridden by environment variable
    const value = overridden ? config.TCPServerAddress : props.value;

    const disabled = props.disabled || isRTCDEnabled || overridden;

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
                        {formatMessage({defaultMessage: 'RTC Server Address (TCP)'})}
                    </label>
                </LabelRow>
            </div>
            <div className={rightCol}>
                <TextInput
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
                    {helpText}
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

export default TCPServerAddress;
