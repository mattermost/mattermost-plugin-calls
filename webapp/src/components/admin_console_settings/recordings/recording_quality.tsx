import React, {ChangeEvent} from 'react';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import {LabelRow, leftCol, rightCol} from 'src/components/admin_console_settings/common';
import {isCloud, isOnPremNotEnterprise, recordingsEnabled} from 'src/selectors';
import {CustomComponentProps} from 'src/types/mattermost-webapp';

const RecordingQuality = (props: CustomComponentProps) => {
    const {formatMessage} = useIntl();
    const restricted = useSelector(isOnPremNotEnterprise);
    const cloud = useSelector(isCloud);
    const recordingEnabled = useSelector(recordingsEnabled);

    if (cloud || restricted || !recordingEnabled) {
        return null;
    }

    const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
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
                        {formatMessage({defaultMessage: 'Call recording quality'})}
                    </label>
                </LabelRow>
            </div>
            <div className={rightCol}>
                <select
                    data-testid={props.id + 'dropdown'}
                    className='form-control'
                    id={props.id}
                    value={props.value}
                    onChange={handleChange}
                    disabled={props.disabled}
                >
                    <option
                        key='low'
                        value='low'
                    >
                        {formatMessage({defaultMessage: 'Low'})}
                    </option>
                    <option
                        key='medium'
                        value='medium'
                    >
                        {formatMessage({defaultMessage: 'Medium'})}
                    </option>
                    <option
                        key='high'
                        value='high'
                    >
                        {formatMessage({defaultMessage: 'High'})}
                    </option>
                </select>
                <div
                    data-testid={props.id + 'help-text'}
                    className='help-text'
                >
                    {formatMessage({defaultMessage: 'The audio and video quality of call recordings.\n Note: this setting can affect the overall performance of the job service and the number of concurrent recording jobs that can be run.'})}
                </div>
            </div>
        </div>
    );
};

export default RecordingQuality;
