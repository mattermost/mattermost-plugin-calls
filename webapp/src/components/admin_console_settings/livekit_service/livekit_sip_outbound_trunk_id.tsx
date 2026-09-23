// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {ChangeEvent} from 'react';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import {LabelRow, leftCol, rightCol} from 'src/components/admin_console_settings/common';
import {callsConfigEnvOverrides} from 'src/selectors';
import {CustomComponentProps} from 'src/types/mattermost-webapp';

export default function LiveKitSIPOutboundTrunkID(props: CustomComponentProps) {
    const {formatMessage} = useIntl();
    const overrides = useSelector(callsConfigEnvOverrides);
    const overridden = 'LiveKitSIPOutboundTrunkID' in overrides;

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
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
                        {formatMessage({defaultMessage: 'SIP Outbound Trunk ID'})}
                    </label>
                </LabelRow>
            </div>
            <div className={rightCol}>
                <input
                    data-testid={props.id + 'input'}
                    id={props.id}
                    className={disabled ? 'form-control disabled' : 'form-control'}
                    type='text'
                    value={props.value}
                    onChange={handleChange}
                    disabled={disabled}
                />
                <div
                    data-testid={props.id + 'help-text'}
                    className='help-text'
                >
                    {formatMessage({defaultMessage: 'LiveKit outbound SIP trunk ID (e.g., ST_xxx). The trunk is created in LiveKit (via CLI or Cloud dashboard) with the SIP provider address and credentials. Leave empty to disable outbound dialing.'})}
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
