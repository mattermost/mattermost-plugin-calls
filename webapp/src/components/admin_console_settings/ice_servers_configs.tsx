import React, {ChangeEvent} from 'react';
import {useIntl} from 'react-intl';
import {
    LabelRow, leftCol, rightCol,
} from 'src/components/admin_console_settings/common';
import manifest from 'src/manifest';
import {CustomComponentProps} from 'src/types/mattermost-webapp';

export default function ICEServersConfigs(props: CustomComponentProps) {
    const {formatMessage} = useIntl();

    // Webapp doesn't pass the placeholder setting.
    const placeholder = manifest.settings_schema?.settings.find((e) => e.key === 'ICEServersConfigs')?.placeholder || '';

    const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
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
                        {formatMessage({defaultMessage: 'ICE Servers Configurations'})}
                    </label>
                </LabelRow>
            </div>
            <div className={rightCol}>
                <textarea
                    data-testid={props.id + 'input'}
                    id={props.id}
                    className='form-control'
                    placeholder={placeholder}
                    value={props.value}
                    onChange={handleChange}
                    disabled={props.disabled}
                    rows={5}
                />
                <div
                    data-testid={props.id + 'help-text'}
                    className='help-text'
                >
                    {formatMessage({defaultMessage: '(Optional) A list of ICE servers (STUN/TURN) configurations to use. This field should contain a valid JSON array.'})}
                </div>
            </div>
        </div>
    );
}
