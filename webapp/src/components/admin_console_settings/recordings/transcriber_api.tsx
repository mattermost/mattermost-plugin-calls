import React, {ChangeEvent, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';
import {setTranscribeAPI} from 'src/actions';
import {LabelRow, leftCol, rightCol} from 'src/components/admin_console_settings/common';
import manifest from 'src/manifest';
import {isCloud, isOnPremNotEnterprise, recordingsEnabled, transcriptionsEnabled} from 'src/selectors';
import {CustomComponentProps} from 'src/types/mattermost-webapp';

const TranscribeAPI = (props: CustomComponentProps) => {
    const {formatMessage} = useIntl();
    const dispatch = useDispatch();
    const restricted = useSelector(isOnPremNotEnterprise);
    const cloud = useSelector(isCloud);
    const hasTranscriptions = useSelector(transcriptionsEnabled);
    const recordingEnabled = useSelector(recordingsEnabled);

    const [api, setAPI] = useState(() => props.value);

    // Update global state with a local state change, or props change (eg, remounting)
    useEffect(() => {
        if (api) {
            dispatch(setTranscribeAPI(api));
        }
    }, [dispatch, api]);

    if (cloud || restricted || !hasTranscriptions || !recordingEnabled) {
        return null;
    }

    // Webapp doesn't pass the options
    const rawOptions = manifest.settings_schema?.settings.find((e) => e.key === 'TranscribeAPI')?.options || [];
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
        setAPI(e.target.value);
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
                        {formatMessage({defaultMessage: 'Call transcriber API'})}
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
                    {formatMessage({defaultMessage: 'The speech-to-text API to use for post-call transcriptions.'})}
                </div>
            </div>
        </div>
    );
};

export default TranscribeAPI;
