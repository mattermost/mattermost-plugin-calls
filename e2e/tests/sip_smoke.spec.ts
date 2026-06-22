// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/* eslint-disable no-process-env */

import {SIPTransport} from '@livekit/protocol';
import {expect, test} from '@playwright/test';
import {RoomServiceClient, SipClient} from 'livekit-server-sdk';

// LiveKit API endpoint + credentials, supplied to the playwright container by
// e2e/scripts/run.sh. The `devkey` pair is the one shared with the SIP bridge
// config (e2e/docker/livekit.yaml + ../../sip.yaml).
const livekitHost = process.env.LIVEKIT_HOST || 'http://livekit:7880';
const livekitApiKey = process.env.LIVEKIT_API_KEY || 'devkey';
const livekitApiSecret = process.env.LIVEKIT_API_SECRET || 'this-is-a-32-plus-character-dev-secret';

// Address of the SIPp UAS sink the bridge dials (host:port on the e2e network).
const sipSinkAddress = process.env.SIP_SINK_ADDRESS || 'sipp:5060';

// This proves the SIP *harness* end to end — LiveKit SIP service is reachable
// over Redis, an outbound trunk + CreateSIPParticipant makes it send an INVITE,
// and the SIPp sink answers it — independent of the SIP outbound feature
// (MM-68360), which the plugin doesn't ship yet. Comprehensive SIP coverage
// that builds on this harness is tracked in MM-69369.
test.describe('SIP harness smoke', {tag: '@sip-smoke'}, () => {
    test('outbound INVITE reaches the SIPp sink', async () => {
        const sip = new SipClient(livekitHost, livekitApiKey, livekitApiSecret);
        const rooms = new RoomServiceClient(livekitHost, livekitApiKey, livekitApiSecret);

        // Unique suffix so concurrent shards / retries don't collide.
        const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
        const roomName = `sip-smoke-${suffix}`;

        let trunkId = '';
        try {
            const trunk = await sip.createSipOutboundTrunk(
                `sip-smoke-sink-${suffix}`,
                sipSinkAddress,
                ['+10000000000'],
                {transport: SIPTransport.SIP_TRANSPORT_UDP},
            );
            trunkId = trunk.sipTrunkId;
            expect(trunkId).toBeTruthy();

            // waitUntilAnswered makes this resolve only after the bridge sends the
            // INVITE and the SIPp sink replies 200 OK — so a successful return is
            // the proof. A dead bridge, a misrouted INVITE, or a silent sink all
            // surface here as a thrown error / timeout.
            const participant = await sip.createSipParticipant(
                trunkId,
                '+15551234567',
                roomName,
                {
                    participantIdentity: `sip-sink-${suffix}`,
                    participantName: 'SIP smoke sink',
                    waitUntilAnswered: true,
                    timeout: 60,
                },
            );

            expect(participant.sipCallId).toBeTruthy();
            expect(participant.participantId).toBeTruthy();
            expect(participant.roomName).toBe(roomName);
        } finally {
            // Tear the room down (LiveKit sends BYE to the sink) and remove the
            // trunk, regardless of assertion outcome.
            await rooms.deleteRoom(roomName).catch(() => { /* room may not exist on early failure */ });
            if (trunkId) {
                await sip.deleteSipTrunk(trunkId).catch(() => { /* best-effort cleanup */ });
            }
        }
    });
});
