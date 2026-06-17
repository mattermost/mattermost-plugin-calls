// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Vendored from @mattermost/calls-common (src/rtc_stats.ts). calls-common is
// being deprecated; this parses a standard W3C RTCStatsReport into the plugin's
// RTCStats shape (see src/types/webrtc.ts). Kept byte-for-byte equivalent so the
// `--- Call Stats ---` log output matches the legacy v1 client.

import {ICEStats, RTCCandidatePairStats, RTCStats, SSRCStats} from 'src/types/webrtc';

export function newRTCLocalInboundStats(report: any) {
    return {
        timestamp: report.timestamp,

        // @ts-ignore: mid is missing current version, we need bump some dependencies to fix this.
        mid: report.mid,
        kind: report.kind,
        trackIdentifier: report.trackIdentifier,
        packetsReceived: report.packetsReceived,
        packetsLost: report.packetsLost,
        packetsDiscarded: report.packetsDiscarded,
        bytesReceived: report.bytesReceived,
        nackCount: report.nackCount,
        pliCount: report.pliCount,
        jitter: report.jitter,
        jitterBufferDelay: report.jitterBufferDelay,
    };
}

export function newRTCLocalOutboundStats(report: any) {
    return {
        timestamp: report.timestamp,

        // @ts-ignore: mid is missing in current version, we need bump some dependencies to fix this.
        mid: report.mid,
        kind: report.kind,
        packetsSent: report.packetsSent,
        bytesSent: report.bytesSent,
        retransmittedPacketsSent: report.retransmittedPacketsSent,
        retransmittedBytesSent: report.retransmittedBytesSent,
        nackCount: report.nackCount,
        pliCount: report.pliCount,
        targetBitrate: report.targetBitrate,
    };
}

export function newRTCRemoteInboundStats(report: any) {
    return {
        timestamp: report.timestamp,
        kind: report.kind,
        packetsLost: report.packetsLost,
        fractionLost: report.fractionLost,
        jitter: report.jitter,
        roundTripTime: report.roundTripTime,
    };
}

export function newRTCRemoteOutboundStats(report: any) {
    return {
        timestamp: report.timestamp,
        kind: report.kind,
        packetsSent: report.packetsSent,
        bytesSent: report.bytesSent,
    };
}

export function newRTCCandidatePairStats(report: any, reports: RTCStatsReport): RTCCandidatePairStats {
    let local;
    let remote;
    reports.forEach((r) => {
        if (r.id === report.localCandidateId) {
            local = r;
        } else if (r.id === report.remoteCandidateId) {
            remote = r;
        }
    });

    return {
        id: report.id,
        timestamp: report.timestamp,
        priority: report.priority,
        packetsSent: report.packetsSent,
        packetsReceived: report.packetsReceived,
        currentRoundTripTime: report.currentRoundTripTime,
        totalRoundTripTime: report.totalRoundTripTime,
        nominated: report.nominated,
        state: report.state,
        local,
        remote,
    };
}

export function parseSSRCStats(reports: RTCStatsReport): SSRCStats {
    const stats: SSRCStats = {};
    reports.forEach((report) => {
        if (!report.ssrc) {
            return;
        }

        if (!stats[report.ssrc]) {
            stats[report.ssrc] = {
                local: {},
                remote: {},
            };
        }

        switch (report.type) {
        case 'inbound-rtp':
            stats[report.ssrc].local.in = newRTCLocalInboundStats(report);
            break;
        case 'outbound-rtp':
            stats[report.ssrc].local.out = newRTCLocalOutboundStats(report);
            break;
        case 'remote-inbound-rtp':
            stats[report.ssrc].remote.in = newRTCRemoteInboundStats(report);
            break;
        case 'remote-outbound-rtp':
            stats[report.ssrc].remote.out = newRTCRemoteOutboundStats(report);
            break;
        }
    });
    return stats;
}

export function parseICEStats(reports: RTCStatsReport): ICEStats {
    const stats: ICEStats = {};
    reports.forEach((report: RTCIceCandidatePairStats) => {
        if (report.type !== 'candidate-pair') {
            return;
        }

        if (!stats[report.state]) {
            stats[report.state] = [];
        }

        stats[report.state].push(newRTCCandidatePairStats(report, reports));
    });

    // We sort pairs so that first values are those nominated and/or have the highest priority.
    for (const pairs of Object.values(stats)) {
        pairs.sort((a, b) => {
            if (a.nominated && !b.nominated) {
                return -1;
            }

            if (b.nominated && !a.nominated) {
                return 1;
            }

            // Highest priority should come first.
            return (b.priority ?? 0) - (a.priority ?? 0);
        });
    }

    return stats;
}

export function parseRTCStats(reports: RTCStatsReport): RTCStats {
    return {
        ssrcStats: parseSSRCStats(reports),
        iceStats: parseICEStats(reports),
    };
}
