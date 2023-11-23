// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {ChangeEvent} from 'react';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import {leftCol, rightCol} from 'src/components/admin_console_settings/common';
import {useHelptext} from 'src/components/admin_console_settings/hooks';
import {rtcdEnabled} from 'src/selectors';
import {CustomComponentProps} from 'src/types/mattermost-webapp';

export const EnableIPv6 = (props: CustomComponentProps) => {
    const {formatMessage} = useIntl();
    const isRTCDEnabled = useSelector(rtcdEnabled);
    const helpText = useHelptext(props.helpText);

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        props.onChange(props.id, e.target.value === 'true');
    };

    // @ts-ignore val is a boolean, but the signature says 'string'. (being defensive here, just in case)
    const checked = props.value === 'true' || props.value === true;

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
                        disabled={isRTCDEnabled}
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
                        disabled={isRTCDEnabled}
                    />
                    {formatMessage({defaultMessage: 'false'})}
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

export default EnableIPv6;
