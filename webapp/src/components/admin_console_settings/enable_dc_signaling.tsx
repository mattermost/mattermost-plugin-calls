import React, {ChangeEvent} from 'react';
import {useIntl} from 'react-intl';
import {leftCol, RadioInput, RadioInputLabel, rightCol} from 'src/components/admin_console_settings/common';
import {CustomComponentProps} from 'src/types/mattermost-webapp';

export default function EnableDCSignaling(props: CustomComponentProps) {
    const {formatMessage} = useIntl();

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
                {formatMessage({defaultMessage: 'Use data channels for signaling (Experimental)'})}
            </label>
            <div className={rightCol}>
                <RadioInputLabel $disabled={props.disabled}>
                    <RadioInput
                        data-testid={props.id + 'true'}
                        type='radio'
                        value='true'
                        id={props.id + 'true'}
                        name={props.id + 'true'}
                        checked={checked}
                        onChange={handleChange}
                        disabled={props.disabled}
                    />
                    {formatMessage({defaultMessage: 'True'})}
                </RadioInputLabel>
                <RadioInputLabel $disabled={props.disabled}>
                    <RadioInput
                        data-testid={props.id + 'false'}
                        type='radio'
                        value='false'
                        id={props.id + 'false'}
                        name={props.id + 'false'}
                        checked={!checked}
                        onChange={handleChange}
                        disabled={props.disabled}
                    />
                    {formatMessage({defaultMessage: 'False'})}
                </RadioInputLabel>
                <div
                    data-testid={props.id + 'help-text'}
                    className='help-text'
                >
                    {formatMessage({defaultMessage: 'When set to true, clients will use WebRTC data channels for signaling of new media tracks. This can result in a more efficient and less race-prone process, especially in case of frequent WebSocket disconnections.'})}
                </div>
            </div>
        </div>
    );
}
