// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {ChangeEvent} from 'react';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import {
    LabelRow, leftCol, rightCol,
} from 'src/components/admin_console_settings/common';
import manifest from 'src/manifest';
import {callsConfig, callsConfigEnvOverrides} from 'src/selectors';
import {CustomComponentProps} from 'src/types/mattermost-webapp';

export default function ICEServersConfigs(props: CustomComponentProps) {
    const {formatMessage} = useIntl();
    const config = useSelector(callsConfig);
    const overrides = useSelector(callsConfigEnvOverrides);
    const overridden = 'ICEServersConfigs' in overrides;

    // Webapp doesn't pass the placeholder setting.
    const placeholder = manifest.settings_schema?.settings.find((e) => e.key === 'ICEServersConfigs')?.placeholder || '';

    const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
        props.onChange(props.id, e.target.value);
    };

    // Use the value from config if it's overridden by environment variable
    const value = overridden ? JSON.stringify(config.ICEServersConfigs, null, 2) : props.value;

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
                        {formatMessage({defaultMessage: 'ICE Servers Configurations'})}
                    </label>
                </LabelRow>
            </div>
            <div className={rightCol}>
                <textarea
                    data-testid={props.id + 'input'}
                    id={props.id}
                    className={disabled ? 'form-control disabled' : 'form-control'}
                    placeholder={placeholder}
                    value={value}
                    onChange={handleChange}
                    disabled={disabled}
                    rows={5}
                />
                <div
                    data-testid={props.id + 'help-text'}
                    className='help-text'
                >
                    {formatMessage({defaultMessage: '(Optional) A list of ICE servers (STUN/TURN) configurations to use. This field should contain a valid JSON array.'})}
                </div>

                {overridden &&
                <div className='alert alert-warning'>
                    {formatMessage({defaultMessage: 'This setting has been set through an environment variable. It cannot be changed through the System Console.'})}
                </div>
                }
            </div>
        </div>
    );
}
