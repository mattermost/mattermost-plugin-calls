// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {ChangeEvent, useEffect, useState} from 'react';
import {FormattedMessage, useIntl} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';
import {setRecordingsEnabled} from 'src/actions';
import {LabelRow,
    leftCol, RadioInput,
    RadioInputLabel,
    rightCol,
} from 'src/components/admin_console_settings/common';
import {callsConfig, callsConfigEnvOverrides, isCloud} from 'src/selectors';
import {CustomComponentProps} from 'src/types/mattermost-webapp';

const EnableRecordings = (props: CustomComponentProps) => {
    const {formatMessage} = useIntl();
    const dispatch = useDispatch();
    const cloud = useSelector(isCloud);
    const config = useSelector(callsConfig);
    const overrides = useSelector(callsConfigEnvOverrides);
    const overridden = 'EnableRecordings' in overrides;

    // @ts-ignore -- this is complaining b/c value is supposed to be string, but... it can be bool!
    const [enabled, setEnabled] = useState(() => props.value === 'true' || props.value === true);

    // Update global state with a local state change, or props change (eg, remounting)
    useEffect(() => {
        dispatch(setRecordingsEnabled(enabled));
    }, [dispatch, enabled]);

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        props.onChange(props.id, e.target.value === 'true');
        setEnabled(e.target.value === 'true');
    };

    // Use the value from config if it's overridden by environment variable
    let value;
    if (overridden) {
        value = config.EnableRecordings;
    } else {
        value = props.value;
    }

    const disabled = props.disabled || overridden;

    if (cloud) {
        return null;
    }

    const checked = value === 'true' || value === true;

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
                        {formatMessage({defaultMessage: 'Enable call recordings'})}
                    </label>
                </LabelRow>
            </div>
            <div className={rightCol}>
                <a id={props.id}/>
                <RadioInputLabel $disabled={disabled}>
                    <RadioInput
                        data-testid={props.id + 'true'}
                        id={props.id + 'true'}
                        type={'radio'}
                        value='true'
                        checked={checked}
                        onChange={handleChange}
                        disabled={disabled}
                    />
                    <FormattedMessage defaultMessage='True'/>
                </RadioInputLabel>

                <RadioInputLabel $disabled={disabled}>
                    <RadioInput
                        data-testid={props.id + 'false'}
                        id={props.id + 'false'}
                        type={'radio'}
                        value='false'
                        checked={!checked}
                        onChange={handleChange}
                        disabled={disabled}
                    />
                    <FormattedMessage defaultMessage='False'/>
                </RadioInputLabel>

                <div
                    data-testid={props.id + 'help-text'}
                    className='help-text'
                >
                    {formatMessage({defaultMessage: '(Optional) When set to true, call recordings are enabled.'})}
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

export default EnableRecordings;
