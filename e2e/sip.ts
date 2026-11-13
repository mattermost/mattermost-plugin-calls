// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/* eslint-disable no-process-env */

import {ParticipantInfo_Kind} from '@livekit/protocol';
import {RoomServiceClient} from 'livekit-server-sdk';

// LiveKit API endpoint + credentials, supplied to the playwright container by
// e2e/scripts/run.sh. The `devkey` pair is the one shared with the SIP bridge.
const livekitHost = process.env.LIVEKIT_HOST || 'http://livekit:7880';
const livekitApiKey = process.env.LIVEKIT_API_KEY || 'devkey';
const livekitApiSecret = process.env.LIVEKIT_API_SECRET || 'this-is-a-32-plus-character-dev-secret';

export function newRoomServiceClient() {
    return new RoomServiceClient(livekitHost, livekitApiKey, livekitApiSecret);
}

// A random E.164 number under the given prefix. Tests run in parallel against one
// shared SIPp sink (e2e/docker/sipp/uas.xml), so each dials its own number to find
// its own LiveKit participant.
export function randomNumber(prefix: string, digits: number) {
    const suffix = Math.floor(Math.random() * (10 ** digits)).toString().padStart(digits, '0');
    return `${prefix}${suffix}`;
}

// Returns the room holding the SIP participant that was dialed with `number`, or ''.
export async function findSIPRoom(rooms: RoomServiceClient, number: string) {
    for (const room of await rooms.listRooms()) {
        // eslint-disable-next-line no-await-in-loop
        const participants = await rooms.listParticipants(room.name).catch((err) => {
            // The room can be deleted between listRooms and here; anything else is a real failure.
            if (err?.status === 404) {
                return [];
            }
            throw err;
        });
        const found = participants.some((p) => p.kind === ParticipantInfo_Kind.SIP &&
            [p.identity, p.name, ...Object.values(p.attributes)].some((v) => v?.includes(number)));
        if (found) {
            return room.name;
        }
    }
    return '';
}
