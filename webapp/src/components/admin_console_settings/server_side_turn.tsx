// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {ChangeEvent} from 'react';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import {leftCol, rightCol} from 'src/components/admin_console_settings/common';
import {useHelptext} from 'src/components/admin_console_settings/hooks';
import {rtcdEnabled} from 'src/selectors';
import {CustomComponentProps} from 'src/types/mattermost-webapp';

export const ServerSideTURN = (props: CustomComponentProps) => {
    const {formatMessage} = useIntl();
    const isRTCDEnabled = useSelector(rtcdEnabled);
    const helpText = useHelptext(props.helpText);

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        const newVal = e.target.value === 'on';

        // @ts-ignore -- newVal needs to be a boolean, but the signature says 'string'
        props.onChange(props.id, newVal);
    };

    // @ts-ignore val is a boolean, but the signature says 'string'. (being defensive here, just in case)
    const checked = props.value === 'on' || props.value === true;

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
                        data-testid={props.id + '_on'}
                        type='radio'
                        value='on'
                        id={props.id + '_on'}
                        name={props.id + '_on'}
                        checked={checked}
                        onChange={handleChange}
                        disabled={isRTCDEnabled}
                    />
                    {formatMessage({defaultMessage: 'On'})}
                </label>
                <label className='radio-inline'>
                    <input
                        data-testid={props.id + '_off'}
                        type='radio'
                        value='off'
                        id={props.id + '_off'}
                        name={props.id + '_off'}
                        checked={!checked}
                        onChange={handleChange}
                        disabled={isRTCDEnabled}
                    />
                    {formatMessage({defaultMessage: 'Off'})}
                </label>
                <div
                    data-testid={props.id + 'help-text'}
                    className='help-text'
                >
                    {helpText}
                </div>
            </div>
        </div>);
};

export default ServerSideTURN;
