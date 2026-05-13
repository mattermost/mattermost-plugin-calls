// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {RTCStats} from '@mattermost/calls-common/lib/types';

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
}
