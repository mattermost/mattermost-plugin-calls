// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {ChangeEvent} from 'react';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import {LabelRow, leftCol, rightCol} from 'src/components/admin_console_settings/common';
import {callsConfigEnvOverrides} from 'src/selectors';
import {CustomComponentProps} from 'src/types/mattermost-webapp';

export default function LiveKitSIPOutboundTrunkNumbers(props: CustomComponentProps) {
    const {formatMessage} = useIntl();
    const overrides = useSelector(callsConfigEnvOverrides);
    const overridden = 'LiveKitSIPOutboundTrunkNumbers' in overrides;

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
                        {formatMessage({defaultMessage: 'SIP Outbound Trunk Numbers'})}
                    </label>
                </LabelRow>
            </div>
            <div className={rightCol}>
                <textarea
                    data-testid={props.id + 'input'}
                    id={props.id}
                    className={disabled ? 'form-control disabled' : 'form-control'}
                    rows={3}
                    value={props.value}
                    onChange={handleChange}
                    disabled={disabled}
                />
                <div
                    data-testid={props.id + 'help-text'}
                    className='help-text'
                >
                    {formatMessage({defaultMessage: 'Caller ID phone numbers for outbound calls, one per line. Each number must also be assigned to the trunk at the SIP provider.'})}
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
