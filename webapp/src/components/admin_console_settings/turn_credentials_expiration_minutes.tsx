import React, {ChangeEvent} from 'react';
import {useIntl} from 'react-intl';
import {
    LabelRow, leftCol, rightCol,
} from 'src/components/admin_console_settings/common';
import manifest from 'src/manifest';
import {CustomComponentProps} from 'src/types/mattermost-webapp';

export default function TURNCredentialsExpirationMinutes(props: CustomComponentProps) {
    const {formatMessage} = useIntl();

    // Webapp doesn't pass the placeholder setting.
    const placeholder = manifest.settings_schema?.settings.find((e) => e.key === 'TURNStaticAuthSecret')?.placeholder || '';

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        props.onChange(props.id, parseInt(e.target.value, 10));
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
                        {formatMessage({defaultMessage: 'TURN Credentials Expiration (minutes)'})}
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
                    value={props.value === null ? '' : props.value}
                    onChange={handleChange}
                    disabled={props.disabled}
                />
                <div
                    data-testid={props.id + 'help-text'}
                    className='help-text'
                >
                    {formatMessage({defaultMessage: '(Optional) The number of minutes that the generated TURN credentials will be valid for.'})}
                </div>
            </div>
        </div>
    );
}

