import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import CompassIcon from 'src/components/icons/compassIcon';
import RecordCircleIcon from 'src/components/icons/record_circle';
import {
    CallRecordingDisclaimerStrings,
    CallTranscribingDisclaimerStrings,
} from 'src/constants';
import {CallJobReduxState} from 'src/types/types';
import {
    capitalize,
} from 'src/utils';

import InCallPrompt from './in_call_prompt';

type Props = {
    isHost: boolean;
    hostChangeAt: number;
    recording?: CallJobReduxState;
    recordingMaxDuration: number;
    onDecline: () => void;
    promptDismissed: () => void;
    transcriptionsEnabled: boolean;
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

    const [recordingWillEndSoon, updateRecordingWillEndSoon] = useState(0);

    useEffect(() => {
        if (!props.isHost || !props.recording || props.recording.start_at === 0 || props.recording.end_at !== 0 || recordingWillEndSoon !== 0) {
            return;
        }

        if (getMinutesLeftBeforeEnd() <= minutesLeftThreshold) {
            updateRecordingWillEndSoon(Date.now());
        }
    }, [props.isHost, props.recording, recordingWillEndSoon, getMinutesLeftBeforeEnd]);

    const hasRecEnded = (props.recording?.end_at ?? 0) > (props.recording?.start_at ?? 0);

    // Unfortunately we cannot update the local redux state immediately because the props.channel is not available,
    // so we have to check which is more up to date and use that.
    let disclaimerDismissedAt = props.recording?.prompt_dismissed_at || 0;
    if (window.opener && window.opener.currentCallData?.recordingPromptDismissedAt > disclaimerDismissedAt) {
        disclaimerDismissedAt = window.opener.currentCallData?.recordingPromptDismissedAt;
    }

    const {formatMessage} = useIntl();

    if (props.isHost && !hasRecEnded && recordingWillEndSoon > disclaimerDismissedAt) {
        return (
            <InCallPrompt
                testId={'recording-will-end-soon'}
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
                leftText={formatMessage({defaultMessage: 'Dismiss'})}
                onLeftButtonClick={props.promptDismissed}
                onCloseButtonClick={props.promptDismissed}
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

    const shouldShowError = props.recording?.error_at && props.recording.error_at > disclaimerDismissedAt;

    // If the prompt was dismissed after the recording has started and after the last host change
    // we don't show this again, unless there was a more recent error.
    if (!hasRecEnded && disclaimerDismissedAt > props.recording?.start_at && disclaimerDismissedAt > props.hostChangeAt) {
        if (!shouldShowError) {
            return null;
        }
    }

    // If the prompt was dismissed after the recording has ended then we
    // don't show this again.
    if (hasRecEnded && disclaimerDismissedAt > props.recording?.end_at) {
        if (!shouldShowError) {
            return null;
        }
    }

    // If the host has changed for the current recording after the banner was dismissed, we should show
    // again only if the user is the new host.
    if (disclaimerDismissedAt > props.recording?.start_at && props.hostChangeAt > disclaimerDismissedAt && !props.isHost) {
        if (!shouldShowError) {
            return null;
        }
    }

    // If the user became host after the recording has ended we don't want to
    // show the "Recording has stopped" banner.
    if (props.isHost && hasRecEnded && props.hostChangeAt > props.recording.end_at) {
        if (!shouldShowError) {
            return null;
        }
    }

    let testId = 'banner-recording';
    const disclaimerStrings = props.transcriptionsEnabled ? CallTranscribingDisclaimerStrings : CallRecordingDisclaimerStrings;
    let header = formatMessage(disclaimerStrings[props.isHost ? 'host' : 'participant'].header);
    let body = formatMessage(disclaimerStrings[props.isHost ? 'host' : 'participant'].body);
    let confirmText = props.isHost ? formatMessage({defaultMessage: 'Dismiss'}) : formatMessage({defaultMessage: 'Understood'});
    let icon = (
        <RecordCircleIcon
            style={{width: '18px', height: '18px'}}
        />);
    const declineText = props.isHost ? '' : formatMessage({defaultMessage: 'Leave call'});

    if (hasRecEnded) {
        if (props.isHost) {
            confirmText = formatMessage({defaultMessage: 'Dismiss'});
        } else {
            confirmText = '';
        }

        testId = 'banner-recording-stopped';
        if (props.transcriptionsEnabled) {
            header = formatMessage({defaultMessage: 'Recording and transcription has stopped. Processing…'});
            body = formatMessage({defaultMessage: 'You can find the recording and transcription in this call\'s chat thread once it has finished processing.'});
        } else {
            header = formatMessage({defaultMessage: 'Recording has stopped. Processing…'});
            body = formatMessage({defaultMessage: 'You can find the recording in this call\'s chat thread once it has finished processing.'});
        }
    }

    let error = '';
    if (props.recording?.err) {
        testId = 'banner-recording-error';
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
            testId={testId}
            icon={icon}
            iconFill='rgb(var(--dnd-indicator-rgb))'
            iconColor='rgb(var(--dnd-indicator-rgb))'
            header={header}
            body={body}
            error={error}
            leftText={confirmText}
            rightText={declineText}
            onLeftButtonClick={props.promptDismissed}
            onRightButtonClick={props.onDecline}
            onCloseButtonClick={props.promptDismissed}
        />
    );
}
