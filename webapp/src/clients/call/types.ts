// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {EmojiData} from '@mattermost/calls-common/lib/types';
import type {RTCStats} from 'src/types/webrtc';

export type RtcTokenResponse = {
    token: string;
    url: string;
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
