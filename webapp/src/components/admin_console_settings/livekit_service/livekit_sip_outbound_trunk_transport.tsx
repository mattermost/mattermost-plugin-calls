// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {ChangeEvent} from 'react';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import {LabelRow, leftCol, rightCol} from 'src/components/admin_console_settings/common';
import {callsConfigEnvOverrides} from 'src/selectors';
import {CustomComponentProps} from 'src/types/mattermost-webapp';

export default function LiveKitSIPOutboundTrunkTransport(props: CustomComponentProps) {
    const {formatMessage} = useIntl();
    const overrides = useSelector(callsConfigEnvOverrides);
    const overridden = 'LiveKitSIPOutboundTrunkTransport' in overrides;

    const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
        props.onChange(props.id, e.target.value);
    };

    const value = props.value || 'auto';

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
                        {formatMessage({defaultMessage: 'SIP Outbound Trunk Transport'})}
                    </label>
                </LabelRow>
            </div>
            <div className={rightCol}>
                <select
                    data-testid={props.id + 'dropdown'}
                    className={disabled ? 'form-control disabled' : 'form-control'}
                    id={props.id}
                    value={value}
                    onChange={handleChange}
                    disabled={disabled}
                >
                    <option value='auto'>{formatMessage({defaultMessage: 'Auto'})}</option>
                    <option value='udp'>{formatMessage({defaultMessage: 'UDP'})}</option>
                    <option value='tcp'>{formatMessage({defaultMessage: 'TCP'})}</option>
                    <option value='tls'>{formatMessage({defaultMessage: 'TLS'})}</option>
                </select>
                <div
                    data-testid={props.id + 'help-text'}
                    className='help-text'
                >
                    {formatMessage({defaultMessage: 'Transport used to reach the SIP provider.'})}
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
