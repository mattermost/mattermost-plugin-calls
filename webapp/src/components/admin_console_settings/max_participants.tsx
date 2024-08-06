// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {ChangeEvent} from 'react';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import {
    LabelRow, leftCol, rightCol,
} from 'src/components/admin_console_settings/common';
import {isAtLeastProfessional, isCloud} from 'src/selectors';
import {CustomComponentProps} from 'src/types/mattermost-webapp';
import {untranslatable} from 'src/utils';

const MaxCallParticipants = (props: CustomComponentProps) => {
    const {formatMessage} = useIntl();
    const cloud = useSelector(isCloud);
    const restricted = !useSelector(isAtLeastProfessional);

    if (cloud) {
        return null;
    }

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        props.onChange(props.id, parseInt(e.target.value, 10));
    };

    const label = formatMessage({defaultMessage: 'Max call participants'});

    const helpText = formatMessage({
        defaultMessage: 'The maximum number of participants that can join a call. If left empty, or set to 0, it means unlimited.',
    });

    const restrictedText = formatMessage({
        defaultMessage: 'This setting is disabled as the server is unlicensed and calls are only available in DM channels.',
    });

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
                        {label}
                    </label>
                </LabelRow>
            </div>
            <div className={rightCol}>
                <input
                    data-testid={props.id + 'number'}
                    id={props.id}
                    className='form-control'
                    type={'number'}
                    value={props.value}
                    onChange={handleChange}
                    disabled={restricted}
                />
                <div
                    data-testid={props.id + 'help-text'}
                    className='help-text'
                >
                    {restricted ? helpText + untranslatable(' ') + restrictedText : helpText}
                </div>
            </div>
        </div>
    );
};

export default MaxCallParticipants;
