// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {ChangeEvent} from 'react';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import {leftCol, RadioInput, RadioInputLabel, rightCol} from 'src/components/admin_console_settings/common';
import {callsConfig, callsConfigEnvOverrides} from 'src/selectors';
import {CustomComponentProps} from 'src/types/mattermost-webapp';

export default function EnableAV1(props: CustomComponentProps) {
    const {formatMessage} = useIntl();
    const config = useSelector(callsConfig);
    const overrides = useSelector(callsConfigEnvOverrides);
    const overridden = 'EnableAV1' in overrides;

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        props.onChange(props.id, e.target.value === 'true');
    };

    // Use the value from config if it's overridden by environment variable
    let checked;
    if (overridden) {
        checked = config.EnableAV1;
    } else {
        // @ts-ignore val is a boolean, but the signature says 'string'. (being defensive here, just in case)
        checked = props.value === 'true' || props.value === true;
    }

    const disabled = props.disabled || overridden;

    return (
        <div
            data-testid={props.id}
            className='form-group'
        >
            <label className={'control-label ' + leftCol}>
                {formatMessage({defaultMessage: 'Enable AV1 codec for screen sharing (Experimental)'})}
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
                    {formatMessage({defaultMessage: 'When set to true it enables using the AV1 codec to encode screen sharing tracks. This can result in improved screen sharing quality for clients that support it.\nNote: this setting won\'t apply when EnableSimulcast is true.'})}
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
