// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {ChangeEvent} from 'react';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import {leftCol, RadioInput, RadioInputLabel, rightCol} from 'src/components/admin_console_settings/common';
import {callsConfig, callsConfigEnvOverrides} from 'src/selectors';
import {CustomComponentProps} from 'src/types/mattermost-webapp';

const TestMode = (props: CustomComponentProps) => {
    const {formatMessage} = useIntl();
    const config = useSelector(callsConfig);
    const overrides = useSelector(callsConfigEnvOverrides);
    const overridden = 'DefaultEnabled' in overrides;

    // Note: this component is taking the DefaultEnabled config setting and converting it to 'TestMode'.
    // DefaultEnabled = true  => TestMode = 'off'
    // DefaultEnabled = false => TestMode = 'on'

    // Use the value from config if it's overridden by environment variable
    let checked;
    if (overridden) {
        checked = !config.DefaultEnabled;
    } else {
        // @ts-ignore val is a boolean, but the signature says 'string'. (being defensive here, just in case)
        checked = !props.value || props.value === 'false' || props.value === false;
    }

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        const newVal = e.target.value !== 'on';

        // @ts-ignore -- newVal needs to be a boolean, but the signature says 'string'
        props.onChange(props.id, newVal);
    };

    const disabled = props.disabled || overridden;

    return (
        <div
            data-testid={props.id}
            className='form-group'
        >
            <label className={'control-label ' + leftCol}>
                {formatMessage({defaultMessage: 'Test mode'})}
            </label>
            <div className={rightCol}>
                <RadioInputLabel $disabled={disabled}>
                    <RadioInput
                        data-testid={props.id + '_on'}
                        type='radio'
                        value='on'
                        id={props.id + '_on'}
                        name={props.id + '_on'}
                        checked={checked}
                        onChange={handleChange}
                        disabled={disabled}
                    />
                    {formatMessage({defaultMessage: 'On'})}
                </RadioInputLabel>
                <RadioInputLabel $disabled={disabled}>
                    <RadioInput
                        data-testid={props.id + '_off'}
                        type='radio'
                        value='off'
                        id={props.id + '_off'}
                        name={props.id + '_off'}
                        checked={!checked}
                        onChange={handleChange}
                        disabled={disabled}
                    />
                    {formatMessage({defaultMessage: 'Off'})}
                </RadioInputLabel>
                <div
                    data-testid={props.id + 'help-text'}
                    className='help-text'
                >
                    {formatMessage({defaultMessage: 'When test mode is enabled, only system admins are able to start calls in channels. This allows testing to confirm calls are working as expected.'})}
                </div>

                {overridden &&
                <div className='alert alert-warning'>
                    {formatMessage({defaultMessage: 'This setting has been set through an environment variable. It cannot be changed through the System Console.'})}
                </div>
                }
            </div>
        </div>);
};

export default TestMode;
