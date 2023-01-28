import React, {useState, useEffect, useCallback} from 'react';

import {RecordCircleOutlineIcon} from '@mattermost/compass-icons/components';

import CompassIcon from 'src/components/icons/compassIcon';

import {
    CallRecordingState,
} from '@calls/common';

import {
    CallRecordingDisclaimerStrings,
} from 'src/constants';

import {
    capitalize,
} from 'src/utils';

import InCallPrompt from './in_call_prompt';

type Props = {
    isHost: boolean,
    hostChangeAt: number,
    recording?: CallRecordingState,
    recordingMaxDuration: number,
    onDecline: () => void;
}

const minutesLeftThreshold = 10;

export default function RecordingInfoPrompt(props: Props) {
    // This is needed to force a re-render to periodically check for recording
    // duration.
    const [, updateState] = useState({});
    useEffect(() => {
        const interval = setInterval(() => updateState({}), 30000);
        return () => clearInterval(interval);
    });

    const getMinutesLeftBeforeEnd = useCallback(() => {
        if (!props.recording?.start_at) {
            return 0;
        }
        const callDurationMinutes = (Date.now() - props.recording.start_at) / (1000 * 60);
        return Math.round(props.recordingMaxDuration - callDurationMinutes);
    }, [props.recording?.start_at, props.recordingMaxDuration]);

    const [dismissedAt, updateDismissedAt] = useState(0);
    const [recordingWillEndSoon, updateRecordingWillEndSoon] = useState(0);

    useEffect(() => {
        if (!props.isHost || !props.recording || props.recording.start_at === 0 || props.recording.end_at !== 0 || recordingWillEndSoon !== 0) {
            return;
        }

        if (getMinutesLeftBeforeEnd() <= minutesLeftThreshold) {
            updateRecordingWillEndSoon(Date.now());
        }
    }, [props.isHost, props.recording, recordingWillEndSoon, getMinutesLeftBeforeEnd]);

    const hasRecEnded = props.recording?.end_at;

    if (props.isHost && !hasRecEnded && recordingWillEndSoon > dismissedAt) {
        return (
            <InCallPrompt
                icon={
                    <CompassIcon
                        icon='alert-outline'
                        style={{
                            fontSize: 18,
                        }}
                    />
                }
                iconFill='rgb(var(--dnd-indicator-rgb))'
                iconColor='rgb(var(--dnd-indicator-rgb))'
                header={`Calls can be recorded for up to ${props.recordingMaxDuration} minutes`}
                body={`Your recording will end in ${getMinutesLeftBeforeEnd()} minutes.`}
                confirmText={'Dismiss'}
                onClose={() => updateDismissedAt(Date.now())}
            />
        );
    }

    // Nothing to show if the recording hasn't started yet, unless there
    // was an error.
    if (!props.recording?.start_at && !props.recording?.err) {
        return null;
    }

    // If the recording has ended we only want to show the info prompt
    // to the host.
    if (hasRecEnded && !props.isHost) {
        return null;
    }

    // If the prompt was dismissed after the recording has started and after the last host change
    // we don't show this again.
    if (!hasRecEnded && dismissedAt > props.recording?.start_at && dismissedAt > props.hostChangeAt) {
        return null;
    }

    // If the prompt was dismissed after the recording has ended then we
    // don't show this again.
    if (hasRecEnded && dismissedAt > props.recording?.end_at) {
        return null;
    }

    let header = CallRecordingDisclaimerStrings[props.isHost ? 'host' : 'participant'].header;
    let body = CallRecordingDisclaimerStrings[props.isHost ? 'host' : 'participant'].body;
    let confirmText = props.isHost ? 'Dismiss' : 'Understood';
    let icon = (
        <RecordCircleOutlineIcon
            size={18}
        />);
    const declineText = props.isHost ? '' : 'Leave call';

    if (hasRecEnded) {
        confirmText = '';
        header = 'Recording has stopped. Processing...';
        body = 'You can find the recording in this call\'s chat thread once it\'s finished processing.';
    }

    let error = '';
    if (props.recording?.err) {
        header = 'Something went wrong with the recording';
        body = 'Please try to record again. You can also contact your system admin for troubleshooting help.';
        error = capitalize(props.recording?.err);

        icon = (
            <CompassIcon
                icon='alert-outline'
                style={{
                    fontSize: 18,
                }}
            />
        );
    }

    return (
        <InCallPrompt
            icon={icon}
            iconFill='rgb(var(--dnd-indicator-rgb))'
            iconColor='rgb(var(--dnd-indicator-rgb))'
            header={header}
            body={body}
            error={error}
            confirmText={confirmText}
            declineText={declineText}
            onClose={() => updateDismissedAt(Date.now())}
            onDecline={props.onDecline}
        />
    );
}
