// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {ChangeEvent} from 'react';
import {CustomComponentProps} from 'src/types/mattermost-webapp';
import {getConfig} from 'mattermost-redux/selectors/entities/admin';
import {useSelector} from 'react-redux';

import manifest from 'src/manifest';

import {
    LabelRow,
} from 'src/components/admin_console_settings/common';

const ICEHostOverride = (props: CustomComponentProps) => {
    const config = useSelector(getConfig);

    // If RTCD is configured then this setting doesn't apply and should be hidden.
    if (config.PluginSettings?.Plugins[manifest.id]?.rtcdserviceurl?.length > 0) {
        return null;
    }

    const leftCol = 'col-sm-4';
    const rightCol = 'col-sm-8';

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
