// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {ChangeEvent, useEffect, useState} from 'react';
import {FormattedMessage, useIntl} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';
import {setRecordingsEnabled} from 'src/actions';
import {LabelRow,
    leftCol, RadioInput,
    RadioInputLabel,
    rightCol,
} from 'src/components/admin_console_settings/common';
import {isCloud} from 'src/selectors';
import {CustomComponentProps} from 'src/types/mattermost-webapp';

const EnableRecordings = (props: CustomComponentProps) => {
    const {formatMessage} = useIntl();
    const dispatch = useDispatch();
    const cloud = useSelector(isCloud);

    // @ts-ignore -- this is complaining b/c value is supposed to be string, but... it can be bool!
    const [enabled, setEnabled] = useState(() => props.value === 'true' || props.value === true);

    // Update global state with a local state change, or props change (eg, remounting)
    useEffect(() => {
        dispatch(setRecordingsEnabled(enabled));
    }, [dispatch, enabled]);

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        props.onChange(props.id, e.target.value === 'true');
        setEnabled(e.target.value === 'true');
    };

    if (cloud) {
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
                        {formatMessage({defaultMessage: 'Enable call recordings'})}
                    </label>
                </LabelRow>
            </div>
            <div className={rightCol}>
                <a id={props.id}/>
                <RadioInputLabel $disabled={props.disabled}>
                    <RadioInput
                        data-testid={props.id + 'true'}
                        id={props.id + 'true'}
                        type={'radio'}
                        value='true'
                        checked={Boolean(props.value)}
                        onChange={handleChange}
                        disabled={props.disabled}
                    />
                    <FormattedMessage defaultMessage='True'/>
                </RadioInputLabel>

                <RadioInputLabel $disabled={props.disabled}>
                    <RadioInput
                        data-testid={props.id + 'false'}
                        id={props.id + 'false'}
                        type={'radio'}
                        value='false'
                        checked={Boolean(!props.value)}
                        onChange={handleChange}
                        disabled={props.disabled}
                    />
                    <FormattedMessage defaultMessage='False'/>
                </RadioInputLabel>

                <div
                    data-testid={props.id + 'help-text'}
                    className='help-text'
                >
                    {formatMessage({defaultMessage: '(Optional) When set to true, call recordings are enabled.'})}
                </div>
            </div>
        </div>
    );
};

export default EnableRecordings;
