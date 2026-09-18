// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {CallJobState, CallState, EmojiData} from '@mattermost/calls-common/lib/types';
import type {RTCStats} from 'src/types/webrtc';

/**
 * Response from POST /livekit-token, which mints the call session and returns
 * everything needed to join in a single round trip. Reading the call state from
 * the writer here is what keeps replica lag from hiding the just-created session.
 */
export type LiveKitSessionResponse = {
    session_id: string;
    token: string;
    url: string;
    call_state: CallState;
};

/**
 * LiveKit room metadata, which carries the call-level state clients cannot
 * derive from LiveKit itself. Delivered on connect and again on every change,
 * so it needs no separate resync path. Mirrors callRoomMetadata server-side.
 */
export type CallRoomMetadata = {
    host_id: string;
    recording?: CallJobState;
    transcription?: CallJobState;
    live_captions?: CallJobState;
};

/**
 * Body of a host_control data message. The action field rather than a topic per
 * command: any host action the LiveKit admin API cannot carry out has this same
 * shape, since the server has to ask the client to do it.
 */
export type HostControlPayload = {
    action: string;
};

/**
 * The single screen share being presented, derived from LiveKit track state.
 *
 * `stream` is null while a remote share has been announced but not yet
 * subscribed, so consumers rendering video should tolerate that and wait for the
 * follow-up emission.
 */
export type ScreenSharingSession = {
    sessionID: string;
    userID: string;
    isLocal: boolean;
    stream: MediaStream | null;
};

export type TrackMetadata = {
    id: string;
    streamID: string;
    kind: string;
    label: string;
    enabled: boolean;
    readyState: MediaStreamTrackState;
}

export type CallClientStats = {
    initTime: number;
    callID: string;
    tracksInfo: TrackMetadata[];
    rtcStats: RTCStats | null;
}

export type ConnectPayload = {
    channelID: string;
    title?: string;
    threadID?: string;

    /**
     * jobID is set only for bot connections (recording / transcription).
     */
    jobID?: string;
}

export type ReactionPayload = {
    emojiData: EmojiData;
    timestamp: number;
};
