// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {ChangeEvent} from 'react';
import {CustomComponentProps} from 'src/types/mattermost-webapp';
import {useSelector} from 'react-redux';

import manifest from 'src/manifest';
import {isCloud, isOnPremNotEnterprise} from 'src/selectors';
import {
    LabelRow,
} from 'src/components/admin_console_settings/common';

const MaxRecordingDuration = (props: CustomComponentProps) => {
    const restricted = useSelector(isOnPremNotEnterprise);
    const cloud = useSelector(isCloud);

    const leftCol = 'col-sm-4';
    const rightCol = 'col-sm-8';

    // Webapp doesn't pass the placeholder setting.
    const placeholder = manifest.settings_schema?.settings.find((e) => e.key === 'MaxRecordingDuration')?.placeholder || '';

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        props.onChange(props.id, parseInt(e.target.value, 10));
    };

    if (cloud || restricted) {
        return null;
    }

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
                    data-testid={props.id + 'number'}
                    id={props.id}
                    className='form-control'
                    type={'number'}
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

export default MaxRecordingDuration;
