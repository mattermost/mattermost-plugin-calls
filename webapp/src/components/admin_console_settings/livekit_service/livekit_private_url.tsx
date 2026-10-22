// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {ChangeEvent} from 'react';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import {LabelRow, leftCol, rightCol} from 'src/components/admin_console_settings/common';
import manifest from 'src/manifest';
import {callsConfigEnvOverrides} from 'src/selectors';
import {CustomComponentProps} from 'src/types/mattermost-webapp';

export default function LiveKitPrivateURL(props: CustomComponentProps) {
    const {formatMessage} = useIntl();
    const overrides = useSelector(callsConfigEnvOverrides);
    const overridden = 'LiveKitPrivateURL' in overrides;

    const placeholder = manifest.settings_schema?.sections?.flatMap((s) => s.settings ?? []).find((e) => e.key === 'LiveKitPrivateURL')?.placeholder ?? '';

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
                        {formatMessage({defaultMessage: 'LiveKit private server URL'})}
                    </label>
                </LabelRow>
            </div>
            <div className={rightCol}>
                <input
                    data-testid={props.id + 'input'}
                    id={props.id}
                    className={disabled ? 'form-control disabled' : 'form-control'}
                    type='text'
                    placeholder={placeholder}
                    value={props.value}
                    onChange={handleChange}
                    disabled={disabled}
                />
                <div
                    data-testid={props.id + 'help-text'}
                    className='help-text'
                >
                    {formatMessage({defaultMessage: '(Optional) The URL the Mattermost server uses to reach LiveKit for room administration and SIP, such as an in-cluster service address (e.g. ws://livekit-server.livekit.svc.cluster.local). Defaults to the LiveKit server URL when empty.'})}
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
