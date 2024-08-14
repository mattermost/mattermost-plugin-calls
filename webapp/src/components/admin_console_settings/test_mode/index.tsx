// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {ChangeEvent} from 'react';
import {useIntl} from 'react-intl';
import {leftCol, RadioInput, RadioInputLabel, rightCol} from 'src/components/admin_console_settings/common';
import {CustomComponentProps} from 'src/types/mattermost-webapp';

const TestMode = (props: CustomComponentProps) => {
    const {formatMessage} = useIntl();

    // Note: this component is taking the DefaultEnabled config setting and converting it to 'TestMode'.
    // DefaultEnabled = true  => TestMode = 'off'
    // DefaultEnabled = false => TestMode = 'on'
    const testMode = props.value ? 'off' : 'on';

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        const newVal = e.target.value !== 'on';

        // @ts-ignore -- newVal needs to be a boolean, but the signature says 'string'
        props.onChange(props.id, newVal);
    };

    return (
        <div
            data-testid={props.id}
            className='form-group'
        >
            <label className={'control-label ' + leftCol}>
                {formatMessage({defaultMessage: 'Test mode'})}
            </label>
            <div className={rightCol}>
                <RadioInputLabel $disabled={props.disabled}>
                    <RadioInput
                        data-testid={props.id + '_on'}
                        type='radio'
                        value='on'
                        id={props.id + '_on'}
                        name={props.id + '_on'}
                        checked={testMode === 'on'}
                        onChange={handleChange}
                        disabled={props.disabled}
                    />
                    {formatMessage({defaultMessage: 'On'})}
                </RadioInputLabel>
                <RadioInputLabel $disabled={props.disabled}>
                    <RadioInput
                        data-testid={props.id + '_off'}
                        type='radio'
                        value='off'
                        id={props.id + '_off'}
                        name={props.id + '_off'}
                        checked={testMode === 'off'}
                        onChange={handleChange}
                        disabled={props.disabled}
                    />
                    {formatMessage({defaultMessage: 'Off'})}
                </RadioInputLabel>
                <div
                    data-testid={props.id + 'help-text'}
                    className='help-text'
                >
                    {formatMessage({defaultMessage: 'When test mode is enabled, only system admins are able to start calls in channels. This allows testing to confirm calls are working as expected.'})}
                </div>
            </div>
        </div>);
};

export default TestMode;
