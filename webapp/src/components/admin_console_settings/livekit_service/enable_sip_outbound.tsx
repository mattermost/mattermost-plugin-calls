// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {ChangeEvent} from 'react';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import {leftCol, RadioInput, RadioInputLabel, rightCol} from 'src/components/admin_console_settings/common';
import {callsConfigEnvOverrides} from 'src/selectors';
import {CustomComponentProps} from 'src/types/mattermost-webapp';

export default function EnableSIPOutbound(props: CustomComponentProps) {
    const {formatMessage} = useIntl();
    const overrides = useSelector(callsConfigEnvOverrides);
    const overridden = 'EnableSIPOutbound' in overrides;

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        props.onChange(props.id, e.target.value === 'true');
    };

    // @ts-ignore val is a boolean, but the signature says 'string'
    const checked = props.value === 'true' || props.value === true;
    const disabled = props.disabled || overridden;

    return (
        <div
            data-testid={props.id}
            className='form-group'
        >
            <label className={'control-label ' + leftCol}>
                {formatMessage({defaultMessage: 'Enable outbound phone dialing'})}
            </label>
            <div className={rightCol}>
                <RadioInputLabel $disabled={disabled}>
                    <RadioInput
                        data-testid={props.id + 'true'}
                        type='radio'
                        value='true'
                        id={props.id + 'true'}
                        name={props.id}
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
                        name={props.id}
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
                    {formatMessage({defaultMessage: 'When set to true, users can dial external phone numbers via LiveKit SIP. Requires a configured SIP Outbound Trunk ID.'})}
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
