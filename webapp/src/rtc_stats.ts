import {RTCStats} from 'src/types/types';

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
                kind: report.kind,
                packetsReceived: report.packetsReceived,
                bytesReceived: report.bytesReceived,
                packetsLost: report.packetsLost,
                packetsDiscarded: report.packetsDiscarded,
                jitter: report.jitter,
                jitterBufferDelay: report.jitterBufferDelay,
            };
            break;
        case 'outbound-rtp':
            stats[report.ssrc].local.out = {
                kind: report.kind,
                packetsSent: report.packetsSent,
                bytesSent: report.bytesSent,
                retransmittedPacketsSent: report.retransmittedPacketsSent,
                retransmittedBytesSent: report.retransmittedBytesSent,
                nackCount: report.nackCount,
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
