// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {ChangeEvent} from 'react';
import {useIntl} from 'react-intl';
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

const LiveCaptionsNumTranscribers = (props: CustomComponentProps) => {
    const {formatMessage} = useIntl();
    const restricted = useSelector(isOnPremNotEnterprise);
    const cloud = useSelector(isCloud);
    const recordingEnabled = useSelector(recordingsEnabled);
    const transcriptionEnabled = useSelector(transcriptionsEnabled);
    const liveCaptionEnabled = useSelector(liveCaptionsEnabled);

    if (cloud || restricted || !recordingEnabled || !transcriptionEnabled || !liveCaptionEnabled) {
        return null;
    }

    // Webapp doesn't pass the default setting.
    const theDefault = manifest.settings_schema?.settings.find((e) => e.key === 'LiveCaptionsNumTranscribers')?.default || '';

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
                        {formatMessage({defaultMessage: 'Live captions: Number of transcribers used per call'})}
                    </label>
                </LabelRow>
            </div>
            <div className={rightCol}>
                <input
                    data-testid={props.id + 'number'}
                    id={props.id}
                    className='form-control'
                    type={'number'}
                    placeholder={theDefault}
                    value={props.value}
                    onChange={handleChange}
                    disabled={props.disabled}
                />
                <div
                    data-testid={props.id + 'help-text'}
                    className='help-text'
                >
                    {formatMessage({defaultMessage: 'The number of separate live-captions transcribers for each call. Each transcribes one audio stream at a time. The product of LiveCaptionsNumTranscribers * LiveCaptionsNumThreadsPerTranscriber must be in the range [1, numCPUs].'})}
                </div>
            </div>
        </div>
    );
};

export default LiveCaptionsNumTranscribers;
