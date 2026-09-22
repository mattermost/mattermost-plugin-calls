// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {ChangeEvent} from 'react';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import {LabelRow, leftCol, rightCol} from 'src/components/admin_console_settings/common';
import {callsConfigEnvOverrides} from 'src/selectors';
import {CustomComponentProps} from 'src/types/mattermost-webapp';

export default function SIPOutboundAllowlist(props: CustomComponentProps) {
    const {formatMessage} = useIntl();
    const overrides = useSelector(callsConfigEnvOverrides);
    const overridden = 'SIPOutboundAllowlist' in overrides;

    const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
        props.onChange(props.id, e.target.value);
    };

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
                        {formatMessage({defaultMessage: 'Outbound phone number allowlist'})}
                    </label>
                </LabelRow>
            </div>
            <div className={rightCol}>
                <textarea
                    data-testid={props.id + 'input'}
                    id={props.id}
                    className={disabled ? 'form-control disabled' : 'form-control'}
                    rows={5}
                    value={props.value}
                    onChange={handleChange}
                    disabled={disabled}
                />
                <div
                    data-testid={props.id + 'help-text'}
                    className='help-text'
                >
                    {formatMessage({defaultMessage: 'Phone numbers permitted for outbound dialing when the allowlist is enabled. Enter one number per line. Numbers are matched after normalization to E.164 format, so formatting variations like +1 555-123-4567 and 15551234567 are equivalent.'})}
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
