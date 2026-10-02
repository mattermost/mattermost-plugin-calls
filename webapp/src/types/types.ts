// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {
    CallPostProps,
    CallsConfig,
    CallStartData,
    CallState,
    LiveCaption,
    SessionState,
    TranscribeAPI,
} from '@mattermost/calls-common/lib/types';
import {MessageDescriptor} from 'react-intl';
import {RTCStats} from 'src/types/webrtc';

export const CallsConfigDefault: CallsConfig = {
    ICEServers: [],
    ICEServersConfigs: [],
    DefaultEnabled: false,
    MaxCallParticipants: 0,
    NeedsTURNCredentials: false,
    AllowScreenSharing: true,
    EnableRecordings: false,
    MaxRecordingDuration: 60,
    sku_short_name: '',
    EnableSimulcast: false,
    EnableRinging: true,
    EnableTranscriptions: false,
    EnableLiveCaptions: false,
    HostControlsAllowed: false,
    EnableAV1: false,
    TranscribeAPI: TranscribeAPI.WhisperCPP,
    GroupCallsAllowed: false,
    EnableDCSignaling: false,
    EnableVideo: false,
    EnableSIPOutbound: false,
};

export type ChannelState = {
    id: string;
    enabled?: boolean;
}

export type CallsClientConfig = {
    wsURL: string;
    authToken?: string;
    iceServers: RTCIceServer[];
    simulcast?: boolean;
    enableAV1: boolean;
    dcSignaling: boolean;
    dcLocking: boolean;
    enableVideo: boolean;
}

export type MediaDevices = {
    inputs: MediaDeviceInfo[];
    outputs: MediaDeviceInfo[];
}

export type TrackMetadata = {
    id: string;
    streamID: string;
    kind: string;
    label: string;
    enabled: boolean;
    readyState: MediaStreamTrackState;
}

export type CallsClientStats = {
    initTime: number;
    channelID: string;
    tracksInfo: TrackMetadata[];
    rtcStats: RTCStats | null;
}

export type CallsUserPreferences = {
    joinSoundParticipantsThreshold: number;
}

export const CallsUserPreferencesDefault = {
    joinSoundParticipantsThreshold: 8,
};

export enum CallAlertType {
    Error = 'error',
    Warning = 'warning',
    Info = 'info'
}

export type CallAlertConfig = {
    type: CallAlertType;
    icon: string;
    bannerText: MessageDescriptor;
    tooltipText?: MessageDescriptor;
    tooltipSubtext?: MessageDescriptor;
    dismissable: boolean;
}

export type CallAlertState = {
    active: boolean;
    show: boolean;
    args?: Record<string, string | React.ReactNode | ((text: React.ReactNode) => React.JSX.Element)>;
}

export type CallAlertStates = {
    [key: string]: CallAlertState;
}

export const CallAlertStatesDefault = {
    missingAudioInput: {
        active: false,
        show: false,
    },
    missingAudioInputPermissions: {
        active: false,
        show: false,
    },
    missingVideoInput: {
        active: false,
        show: false,
    },
    missingVideoInputPermissions: {
        active: false,
        show: false,
    },
    missingScreenPermissions: {
        active: false,
        show: false,
    },
    screenShareBlockedByRemote: {
        active: false,
        show: false,
    },
    screenShareCaptureError: {
        active: false,
        show: false,
    },
    degradedCallQuality: {
        active: false,
        show: false,
    },
    audioInputDeviceFallback: {
        active: false,
        show: false,
    },
    audioOutputDeviceFallback: {
        active: false,
        show: false,
    },
};

export type CallJobReduxState = {
    init_at: number;
    start_at: number;
    end_at: number;
    err?: string;
    error_at?: number;
    prompt_dismissed_at?: number;
}

export type ShareScreenError = 'not-connected' | 'already-sharing' | 'permission-denied' | 'capture-error';
export type ShareScreenResult = [stream: MediaStream | null, error: ShareScreenError | null];

export type CapturerSource = {
    id: string;
    name: string;
    thumbnailURL: string;
    display_id: string;
}

// currentCallData (of type CurrentCallData) is attached to the widget's window to keep persistent data across
// the various call windows. As a simple rule, if a child window (eg, ExpandedViewWindow) sets data,
// set it directly in the window.opener.currentCallData, and read that data when needing up-to-date
// data. The widget needs to set/read data on its window.currentCallData object.
// Reminder: obviously this is not reactive; setting data will not update the other window.
export type CurrentCallData = {
    recordingPromptDismissedAt: number;
    missingScreenPermissions: boolean;
    dmCalleeAnsweredAt: number;
}

export const CurrentCallDataDefault: CurrentCallData = {
    recordingPromptDismissedAt: 0,
    missingScreenPermissions: false,
    dmCalleeAnsweredAt: 0,
};

// Similar to currentCallData, callActions is a cross-window function to trigger a change in that
// owning window. recordingPromptDismissedAt should be set by that window's init function or constructor.
export type CallActions = {
    setRecordingPromptDismissedAt: (callId: string, dismissedAt: number) => void;
    setMissingScreenPermissions: (missing: boolean) => void;
}

export enum ChannelType {
    DM,
    GM
}

export type IncomingCallNotification = {
    callID: string;
    channelID: string;
    callerID: string;
    startAt: number;
    type: ChannelType;
}

export enum HostControlNoticeType {
    LowerHand,
    HostChanged,
    HostRemoved,
}

export type HostControlNotice = {
    type: HostControlNoticeType;
    callID: string;
    noticeID: string;
    displayName: string;
    userID?: string;
}

export type HostControlNoticeTimeout = {
    callID: string;
    noticeID: string;
}

export type RemoveConfirmationData = {
    sessionID: string;
    userID: string;
}

// From webapp because the constants file is not import friendly.
export const UserStatuses = {
    OUT_OF_OFFICE: 'ooo',
    OFFLINE: 'offline',
    AWAY: 'away',
    ONLINE: 'online',
    DND: 'dnd',
};

export type RealNewPostMessageProps = {
    channel_display_name: string;
    channel_name: string;
    channel_type: ChannelType;
    mentions: string; // JSON string[]
    post: string; // JSON Post
    sender_name: string; // @username
    set_online: boolean;
    team_id: string;
}

export type LiveCaptions = {
    [sessionID: string]: LiveCaption;
}

// DM call status coming from post.props.call_status,
// values are defined in server/dm_timer.go
export enum CallPostStatus {
    Calling = 'calling',
    Ended = 'ended',
    NoAnswer = 'no_answer',
    Canceled = 'canceled_by_caller',
    Declined = 'declined',
    Failed = 'failed',
}

// Phone calls

// Matches callTypePhone in server/sip.go.
export const CALL_TYPE_PHONE = 'phone';

export type PhoneCallProps = {
    number: string;
    displayNumber: string;
    label: string;
    targetUserID: string;
}

// Phone fields the server adds to call_state and the call_start event
// (see phoneCallFields in server/plugin.go). Typed here rather than in
// calls-common since they are specific to this plugin.
export type PhoneCallFields = {
    type?: string;
    phone_number?: string;
    display_number?: string;
    display_label?: string;
    target_user_id?: string;
}

export type PhoneCallState = CallState & PhoneCallFields & {
    sessions: PhoneSessionState[];
};

export type PhoneCallStartData = CallStartData & PhoneCallFields;

export type PhoneSessionState = SessionState & {
    is_sip_participant?: boolean;
}

// Values of the sip.callStatus LiveKit attribute, see CALL_ATTRIBUTES.SIP_CALL_STATUS.
export type SIPCallStatus = 'dialing' | 'ringing' | 'automation' | 'active' | 'hangup';

export const SIP_CALL_STATUSES: ReadonlyArray<SIPCallStatus> = ['dialing', 'ringing', 'automation', 'active', 'hangup'];

export type SIPCallState = {
    status: SIPCallStatus;

    // When the leg first became active. Client-side only, so the call timer
    // excludes the time spent dialing and ringing.
    answeredAt: number;
}

export type CallsPostProps = CallPostProps & {
    call_status: CallPostStatus | '';

    // Phone call fields, see phoneCallPostProps in server/plugin.go.
    // The type lives under call_type since core treats props.type as the post type.
    call_type?: string;
    phone_number?: string;
    display_number?: string;
    display_label?: string;
    target_user_id?: string;
    cross_post_id?: string;
}

// Matching the type in server/public/stats.go
export type CallsStats = {
    total_calls: number;
    total_active_calls: number;
    total_active_sessions: number;
    calls_by_day: Record<string, number>;
    calls_by_month: Record<string, number>;
    calls_by_channel_type: Record<string, number>;
    avg_duration: number;
    avg_participants: number;
    recording_jobs_by_day: Record<string, number>;
    recording_jobs_by_month: Record<string, number>;
};

// Desktop types

export type CallsDesktopJoinResponse = {
    callID: string;
    sessionID: string;

    // DEPRECATED: legacy Desktop API logic (<= 5.6.0)
    type?: string;
}
