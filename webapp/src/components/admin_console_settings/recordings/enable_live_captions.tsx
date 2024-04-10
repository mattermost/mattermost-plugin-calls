// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {ChangeEvent, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';
import {setLiveCaptionsEnabled} from 'src/actions';
import {leftCol, rightCol} from 'src/components/admin_console_settings/common';
import {isCloud, isOnPremNotEnterprise, recordingsEnabled, transcriptionsEnabled} from 'src/selectors';
import {CustomComponentProps} from 'src/types/mattermost-webapp';

export const EnableLiveCaptions = (props: CustomComponentProps) => {
    const dispatch = useDispatch();
    const {formatMessage} = useIntl();
    const restricted = useSelector(isOnPremNotEnterprise);
    const cloud = useSelector(isCloud);
    const recordingEnabled = useSelector(recordingsEnabled);
    const transcriptionEnabled = useSelector(transcriptionsEnabled);

    // @ts-ignore -- this is complaining b/c value is supposed to be string, but... it can be bool!
    const [enabled, setEnabled] = useState(() => props.value === 'true' || props.value === true);

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        props.onChange(props.id, e.target.value === 'true');
        setEnabled(e.target.value === 'true');
    };

    // Update global state with a local state change, or props change (eg, remounting)
    useEffect(() => {
        dispatch(setLiveCaptionsEnabled(enabled));
    }, [dispatch, enabled]);

    // @ts-ignore val is a boolean, but the signature says 'string'. (being defensive here, just in case)
    const checked = props.value === 'true' || props.value === true;

    if (cloud || restricted || !recordingEnabled || !transcriptionEnabled) {
        return null;
    }

    return (
        <div
            data-testid={props.id}
            className='form-group'
        >
            <label className={'control-label ' + leftCol}>
                {props.label}
            </label>
            <div className={rightCol}>
                <label className='radio-inline'>
                    <input
                        data-testid={props.id + 'true'}
                        type='radio'
                        value='true'
                        id={props.id + 'true'}
                        name={props.id + 'true'}
                        checked={checked}
                        onChange={handleChange}
                    />
                    {formatMessage({defaultMessage: 'true'})}
                </label>
                <label className='radio-inline'>
                    <input
                        data-testid={props.id + 'false'}
                        type='radio'
                        value='false'
                        id={props.id + 'false'}
                        name={props.id + 'false'}
                        checked={!checked}
                        onChange={handleChange}
                    />
                    {formatMessage({defaultMessage: 'false'})}
                </label>
                <div
                    data-testid={props.id + 'help-text'}
                    className='help-text'
                >
                    {props.helpText}
                </div>
            </div>
        </div>);
};

export default EnableLiveCaptions;
