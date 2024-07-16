// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {ChangeEvent, useEffect, useState} from 'react';
import {useDispatch, useSelector} from 'react-redux';
import {setRTCDEnabled} from 'src/actions';
import {
    LabelRow,
    leftCol,
    rightCol,
} from 'src/components/admin_console_settings/common';
import manifest from 'src/manifest';
import {isOnPremNotEnterprise} from 'src/selectors';
import {CustomComponentProps} from 'src/types/mattermost-webapp';

const RTCDServiceUrl = (props: CustomComponentProps) => {
    const dispatch = useDispatch();
    const restricted = useSelector(isOnPremNotEnterprise);

    const [enabled, setEnabled] = useState(() => !restricted && props.value?.length > 0);

    // Update global state with a local state change, or props change (eg, remounting)
    useEffect(() => {
        dispatch(setRTCDEnabled(enabled));
    }, [dispatch, enabled]);

    // Webapp doesn't pass the placeholder setting.
    const placeholder = manifest.settings_schema?.settings.find((e) => e.key === 'RTCDServiceURL')?.placeholder || '';

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        props.onChange(props.id, e.target.value);
        setEnabled(e.target.value.length > 0);
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
        </div>);
};

export default RTCDServiceUrl;
