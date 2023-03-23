import React, {useState, useEffect, useCallback} from 'react';
import {useIntl} from 'react-intl';

import {RecordCircleOutlineIcon} from '@mattermost/compass-icons/components';

import {CallRecordingState} from '@calls/common/lib/types';

import CompassIcon from 'src/components/icons/compassIcon';

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

    const [dismissedAt, updateDismissedAt] = useState(() => (window.opener ? window.opener.currentCallData?.recording.promptDismissedAt || 0 : 0));
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

    const {formatMessage} = useIntl();

    const updateDismissed = () => {
        updateDismissedAt(Date.now());
        if (window.opener && window.opener.currentCallData) {
            window.opener.currentCallData.recording.promptDismissedAt = Date.now();
        }
    };

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
                header={formatMessage({
                    defaultMessage: 'Calls can be recorded for up to {count, plural, =1 {# minute} other {# minutes}}.',
                }, {count: props.recordingMaxDuration})}
                body={formatMessage({
                    defaultMessage: 'Your recording will end in {count, plural, =1 {# minute} other {# minutes}}.'}
                , {count: getMinutesLeftBeforeEnd()})}
                confirmText={formatMessage({defaultMessage: 'Dismiss'})}
                onClose={updateDismissed}
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
    // we don't show this again, unless there was a more recent error.
    if (!hasRecEnded && dismissedAt > props.recording?.start_at && dismissedAt > props.hostChangeAt) {
        if (!props.recording?.error_at || dismissedAt > props.recording.error_at) {
            return null;
        }
    }

    // If the prompt was dismissed after the recording has ended then we
    // don't show this again.
    if (hasRecEnded && dismissedAt > props.recording?.end_at) {
        return null;
    }

    let header = formatMessage(CallRecordingDisclaimerStrings[props.isHost ? 'host' : 'participant'].header);
    let body = formatMessage(CallRecordingDisclaimerStrings[props.isHost ? 'host' : 'participant'].body);
    let confirmText = props.isHost ? formatMessage({defaultMessage: 'Dismiss'}) : formatMessage({defaultMessage: 'Understood'});
    let icon = (
        <RecordCircleOutlineIcon
            size={18}
        />);
    const declineText = props.isHost ? '' : formatMessage({defaultMessage: 'Leave call'});

    if (hasRecEnded) {
        confirmText = '';
        header = formatMessage({defaultMessage: 'Recording has stopped. Processing…'});
        body = formatMessage({defaultMessage: 'You can find the recording in this call\'s chat thread once it\'s finished processing.'});
    }

    let error = '';
    if (props.recording?.err) {
        header = formatMessage({defaultMessage: 'Something went wrong with the recording'});
        body = formatMessage({defaultMessage: 'Please try to record again. You can also contact your system admin for troubleshooting help.'});
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
            onClose={updateDismissed}
            onDecline={props.onDecline}
        />
    );
}
