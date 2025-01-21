// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {FormattedMessage} from 'react-intl';
import {useSelector} from 'react-redux';
import {transcriptionsEnabled} from 'src/selectors';

export const PostTypeRecording = () => {
    const hasTranscriptions = useSelector(transcriptionsEnabled);

    const msg = hasTranscriptions ? <FormattedMessage defaultMessage={'Here\'s the call recording. Transcription is processing and will be posted when ready.'}/> : <FormattedMessage defaultMessage={'Here\'s the call recording'}/>;

    return (
        <>
            {msg}
        </>
    );
};
