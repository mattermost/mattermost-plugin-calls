// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {ChangeEvent} from 'react';

import {CustomComponentProps} from 'src/types/mattermost-webapp';
import {useSelector} from 'react-redux';

import {rtcdEnabled} from 'src/selectors';

import manifest from 'src/manifest';

import {
    LabelRow, leftCol, rightCol,
} from 'src/components/admin_console_settings/common';

const ICEHostOverride = (props: CustomComponentProps) => {
    const isRtcdEnabled = useSelector(rtcdEnabled);

    // If RTCD is configured then this setting doesn't apply and should be hidden.
    if (isRtcdEnabled) {
        return null;
    }

    // Webapp doesn't pass the placeholder setting.
    const placeholder = manifest.settings_schema?.settings.find((e) => e.key === 'ICEHostOverride')?.placeholder || '';

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        props.onChange(props.id, e.target.value);
    };

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
                        {props.label}
                    </label>
                </LabelRow>
            </div>
            <div className={rightCol}>
                <input
                    data-testid={props.id + 'input'}
                    id={props.id}
                    className='form-control'
                    type={'input'}
                    placeholder={placeholder}
                    value={props.value}
                    onChange={handleChange}
                    disabled={props.disabled}
                />
                <div
                    data-testid={props.id + 'help-text'}
                    className='help-text'
                >
                    {props.helpText}
                </div>
            </div>
        </div>
    );
};

export default ICEHostOverride;
