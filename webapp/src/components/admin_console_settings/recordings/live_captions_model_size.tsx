import React, {ChangeEvent} from 'react';
import {useSelector} from 'react-redux';
import {LabelRow, leftCol, rightCol} from 'src/components/admin_console_settings/common';
import manifest from 'src/manifest';
import {
    isCloud,
    isOnPremNotEnterprise,
    liveCaptionsEnabled,
    recordingsEnabled,
    transcriptionsEnabled,
} from 'src/selectors';
import {CustomComponentProps} from 'src/types/mattermost-webapp';

const LiveCaptionsModelSize = (props: CustomComponentProps) => {
    const restricted = useSelector(isOnPremNotEnterprise);
    const cloud = useSelector(isCloud);
    const recordingEnabled = useSelector(recordingsEnabled);
    const transcriptionEnabled = useSelector(transcriptionsEnabled);
    const liveCaptionEnabled = useSelector(liveCaptionsEnabled);

    if (cloud || restricted || !recordingEnabled || !transcriptionEnabled || !liveCaptionEnabled) {
        return null;
    }

    // Webapp doesn't pass the options
    const rawOptions = manifest.settings_schema?.settings.find((e) => e.key === 'LiveCaptionsModelSize')?.options || [];
    const options = [];
    for (const {display_name, value} of rawOptions) {
        options.push(
            <option
                value={value}
                key={value}
            >
                {display_name}
            </option>,
        );
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
                        {props.label}
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
                    {options}
                </select>
                <div
                    data-testid={props.id + 'help-text'}
                    className='help-text'
                >
                    {props.helpText}
                </div>
            </div>
        </div>
    );
};

export default LiveCaptionsModelSize;
