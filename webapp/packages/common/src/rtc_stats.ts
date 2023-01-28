import {RTCStats} from './types';

export function parseRTCStats(reports: RTCStatsReport): RTCStats {
    const stats: RTCStats = {};
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
            stats[report.ssrc].local.in = {

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
            break;
        case 'outbound-rtp':
            stats[report.ssrc].local.out = {

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
            break;
        case 'remote-inbound-rtp':
            stats[report.ssrc].remote.in = {
                kind: report.kind,
                packetsLost: report.packetsLost,
                fractionLost: report.fractionLost,
                jitter: report.jitter,
            };
            break;
        case 'remote-outbound-rtp':
            stats[report.ssrc].remote.out = {
                kind: report.kind,
                packetsSent: report.packetsSent,
                bytesSent: report.bytesSent,
            };
            break;
        }
    });
    return stats;
}
