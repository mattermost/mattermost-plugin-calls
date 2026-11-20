// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {ChangeEvent} from 'react';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import {leftCol, RadioInput, RadioInputLabel, rightCol} from 'src/components/admin_console_settings/common';
import {callsConfig, callsConfigEnvOverrides} from 'src/selectors';
import {CustomComponentProps} from 'src/types/mattermost-webapp';

export default function EnableDMVideo(props: CustomComponentProps) {
    const {formatMessage} = useIntl();
    const config = useSelector(callsConfig);
    const overrides = useSelector(callsConfigEnvOverrides);
    const overridden = 'EnableDMVideo' in overrides;

    const labelId = props.id + '-label';
    const helpTextId = props.id + '-help-text';
    const overrideId = props.id + '-override';

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        props.onChange(props.id, e.target.value === 'true');
    };

    let checked;
    if (overridden) {
        checked = config.EnableDMVideo;
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
            <label
                id={labelId}
                className={'control-label ' + leftCol}
            >
                {formatMessage({defaultMessage: 'Enable video calls in direct messages'})}
            </label>
            <div className={rightCol}>
                <div
                    role='radiogroup'
                    aria-labelledby={labelId}
                    aria-describedby={overridden ? `${helpTextId} ${overrideId}` : helpTextId}
                >
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
                </div>
                <div
                    id={helpTextId}
                    data-testid={props.id + 'help-text'}
                    className='help-text'
                >
                    {formatMessage({defaultMessage: 'When set to true, participants in direct messages can turn on their camera during a call.'})}
                </div>

                {overridden &&
                <div
                    id={overrideId}
                    className='alert alert-warning'
                >
                    {formatMessage({defaultMessage: 'This setting has been set through an environment variable. It cannot be changed through the System Console.'})}
                </div>
                }
            </div>
        </div>
    );
}
