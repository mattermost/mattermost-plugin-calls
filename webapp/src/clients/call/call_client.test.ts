// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {EmojiData} from '@mattermost/calls-common/lib/types';
import {
    ConnectionQuality,
    ConnectionState,
    LocalAudioTrack,
    LocalVideoTrack,
    Room,
    RoomEvent,
    Track,
} from 'livekit-client';
import RestClient from 'src/clients/rest';
import {
    STORAGE_CALLS_CLIENT_LOGS_KEY,
    STORAGE_CALLS_CLIENT_STATS_KEY,
    STORAGE_CALLS_DEFAULT_AUDIO_INPUT_KEY,
    STORAGE_CALLS_DEFAULT_AUDIO_OUTPUT_KEY,
} from 'src/constants';
import {flushLogsToAccumulated} from 'src/log';
import {getPersistentStorage, getScreenStream} from 'src/utils';

import CallClient from './call_client';
import {CALL_EVENT, CALL_MESSAGE_TOPICS} from './constants';

jest.mock('livekit-client', () => {
    const actual = jest.requireActual('livekit-client');
    const RoomMock = jest.fn() as unknown as jest.Mock & {
        getLocalDevices: jest.Mock;
    };

    // Production code reads devices via the static Room.getLocalDevices wrapper,
    // but tests stub navigator.mediaDevices.enumerateDevices. Bridge the two so
    // existing tests keep working.
    RoomMock.getLocalDevices = jest.fn(async (kind?: MediaDeviceKind) => {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return kind ? devices.filter((d) => d.kind === kind) : devices;
    });

    // Lightweight stand-ins for the screen-share track wrappers so the desktop
    // path can be exercised without jsdom/WebRTC. Production code sets `.source`
    // on the instance, so a plain mutable object is enough. stop() delegates to
    // the underlying MediaStreamTrack as the real wrappers do, which is what
    // releases the capture when a publish is abandoned.
    const localTrackMock = (mediaStreamTrack: MediaStreamTrack) => ({
        mediaStreamTrack,
        source: undefined,
        stop: jest.fn(() => mediaStreamTrack.stop?.()),
    });
    const LocalVideoTrackMock = jest.fn().mockImplementation(localTrackMock);
    const LocalAudioTrackMock = jest.fn().mockImplementation(localTrackMock);

    return {
        ...actual,
        Room: RoomMock,
        LocalVideoTrack: LocalVideoTrackMock,
        LocalAudioTrack: LocalAudioTrackMock,
    };
});

jest.mock('src/utils', () => ({
    ...jest.requireActual('src/utils'),
    getScreenStream: jest.fn(),
}));

jest.mock('src/clients/rest', () => ({
    __esModule: true,
    default: {
        fetch: jest.fn(),
    },
}));

// Mock factory for a Room instance — captures every `room.on(event, handler)`
// call so tests can fire events back through the registered handler.
type RoomEventHandler = (...args: any[]) => void;

type MockRoom = {
    on: jest.Mock;
    state?: ConnectionState;
    connect: jest.Mock;
    prepareConnection: jest.Mock;
    disconnect: jest.Mock;
    removeAllListeners: jest.Mock;
    switchActiveDevice: jest.Mock;
    localParticipant: any;
    remoteParticipants: Map<string, any>;
    metadata?: string;
    fire: RoomEventHandler;
};

function createMockRoom(): MockRoom {
    const handlers = new Map<string, RoomEventHandler>();
    const room: MockRoom = {
        on: jest.fn((event: string, handler: RoomEventHandler) => {
            handlers.set(event, handler);
            return room;
        }),
        connect: jest.fn().mockResolvedValue(null),
        prepareConnection: jest.fn().mockResolvedValue(null),
        disconnect: jest.fn().mockResolvedValue(null),
        removeAllListeners: jest.fn().mockReturnValue(null),
        switchActiveDevice: jest.fn().mockResolvedValue(null),
        localParticipant: {
            sid: 'me-sid',
            identity: 'me-id___me-session',
            getTrackPublication: jest.fn(),
            setMicrophoneEnabled: jest.fn().mockResolvedValue(null),
            setScreenShareEnabled: jest.fn().mockResolvedValue(null),
            createScreenTracks: jest.fn().mockResolvedValue([]),
            publishTrack: jest.fn().mockResolvedValue(null),
            unpublishTrack: jest.fn().mockResolvedValue(null),
            setAttributes: jest.fn().mockResolvedValue(undefined),
            publishData: jest.fn().mockResolvedValue(undefined),
            audioTrackPublications: new Map(),
            trackPublications: new Map(),
            attributes: {},
        },
        remoteParticipants: new Map(),
        fire: (event: string, ...args: any[]) => {
            const handler = handlers.get(event);
            if (!handler) {
                throw new Error(`No handler registered for room event: ${event}`);
            }
            handler(...args);
        },
    };
    return room;
}

// The shape POST /livekit-token returns: session id, LiveKit credentials and the
// call state snapshot, all in one round trip.
const sessionResponse = {
    session_id: 'me-session',
    token: 'fake-token',
    url: 'wss://fake.url',
    call_state: {id: 'call-id', sessions: []},
};

beforeAll(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
        value: {
            getUserMedia: jest.fn().mockResolvedValue({
                getTracks: () => [],
            }),
            enumerateDevices: jest.fn().mockResolvedValue([]),
            addEventListener: jest.fn(),
            removeEventListener: jest.fn(),
        },
        configurable: true,
        writable: true,
    });

    // Richer MediaStream mock so screen-share code can call addTrack / getTracks / id.
    let mediaStreamCounter = 0;
    (global as any).MediaStream = jest.fn().mockImplementation((initialTracks?: MediaStreamTrack[]) => {
        const tracks: MediaStreamTrack[] = initialTracks ? [...initialTracks] : [];
        mediaStreamCounter += 1;
        return {
            id: `mock-stream-${mediaStreamCounter}`,
            tracks,
            addTrack: jest.fn((t: MediaStreamTrack) => {
                tracks.push(t);
            }),
            getTracks: jest.fn(() => tracks),
        };
    });
});

beforeEach(() => {
    window.localStorage.clear();
    (navigator.mediaDevices.enumerateDevices as jest.Mock).mockResolvedValue([]);
});

describe('CallClient', () => {
    let client: CallClient;
    let mockRoom: MockRoom;

    beforeEach(() => {
        mockRoom = createMockRoom();
        (Room as unknown as jest.Mock).mockImplementation(() => mockRoom);
        (RestClient.fetch as jest.Mock).mockResolvedValue({...sessionResponse});

        client = new CallClient();
    });

    afterEach(() => {
        // handleConnected starts a stats-polling interval; clear it so tests that
        // fire RoomEvent.Connected without disconnecting don't leak a live timer.
        (client as unknown as {stopStatsPolling(): void}).stopStatsPolling();
        jest.clearAllMocks();
    });

    describe('initial state', () => {
        it('initializes fields to defaults', () => {
            expect(client.channelID).toBe('');
            expect(client.initTime).toBe(0);
            expect(client.getSessionID()).toBeNull();
            expect(Room).toHaveBeenCalledTimes(1);
        });
    });

    describe('connect', () => {
        it('creates the session over HTTP and calls room.connect with the returned credentials', async () => {
            await client.connect({channelID: 'test-channel', title: 'Test Call', threadID: 'thread-id'});

            expect(RestClient.fetch).toHaveBeenCalledWith(
                expect.stringContaining('livekit-token'),
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({
                        channel_id: 'test-channel',
                        title: 'Test Call',
                        thread_id: 'thread-id',
                    }),
                }),
            );
            expect(mockRoom.connect).toHaveBeenCalledWith('wss://fake.url', 'fake-token');
        });

        it('takes the session id from the join response, so it is known before the room connects', async () => {
            const connectPromise = client.connect({channelID: 'test-channel'});
            await connectPromise;

            expect(client.getSessionID()).toBe('me-session');
        });

        it('emits the call state snapshot from the join response', async () => {
            const listener = jest.fn();
            client.on(CALL_EVENT.CALL_STATE, listener);

            await client.connect({channelID: 'test-channel'});

            expect(listener).toHaveBeenCalledWith(sessionResponse.call_state);
        });

        it('throws if a room is already connected', async () => {
            await client.connect({channelID: 'test-channel'});
            await expect(client.connect({channelID: 'test-channel'})).rejects.toThrow('already connected');
        });

        it('throws and emits ERROR if the join response is incomplete', async () => {
            (RestClient.fetch as jest.Mock).mockResolvedValueOnce({session_id: '', token: '', url: ''});
            const errorListener = jest.fn();
            client.on(CALL_EVENT.ERROR, errorListener);

            await expect(client.connect({channelID: 'test-channel'})).rejects.toThrow('incomplete session response');
            expect(errorListener).toHaveBeenCalledWith(expect.any(Error));
        });

        it('emits ERROR when room.connect rejects', async () => {
            mockRoom.connect.mockRejectedValueOnce(new Error('network down'));
            const errorListener = jest.fn();
            client.on(CALL_EVENT.ERROR, errorListener);

            await expect(client.connect({channelID: 'test-channel'})).rejects.toThrow('network down');
            expect(errorListener).toHaveBeenCalledWith(expect.any(Error));
            expect((client as unknown as {room: unknown}).room).toBeNull();
        });
    });

    describe('isConnected / isDisconnected getters', () => {
        it('isConnected is false before connect, true once the room is connected, and isDisconnected flips on disconnect', async () => {
            expect(client.isConnected).toBe(false);
            expect(client.isDisconnected).toBe(false);

            await client.connect({channelID: 'test-channel'});
            expect(client.isConnected).toBe(true);
            expect(client.isDisconnected).toBe(false);

            mockRoom.fire(RoomEvent.Disconnected);
            expect(client.isConnected).toBe(false);
            expect(client.isDisconnected).toBe(true);
        });
    });

    describe('disconnect', () => {
        it('on a connected room, delegates to room.disconnect() so the LiveKit event drives teardown', async () => {
            await client.connect({channelID: 'test-channel'});
            mockRoom.state = ConnectionState.Connected;

            const disconnectedListener = jest.fn();
            client.on(CALL_EVENT.DISCONNECTED, disconnectedListener);

            client.disconnect();
            expect(mockRoom.disconnect).toHaveBeenCalled();

            // Teardown is driven by the resulting RoomEvent.Disconnected, not synchronously here.
            mockRoom.fire(RoomEvent.Disconnected);
            expect(client.isDisconnected).toBe(true);
            expect(disconnectedListener).toHaveBeenCalled();
        });

        // Builds a publication whose track returns the given stats report, and seeds
        // a single poll sample into lastStats — the same path the interval drives.
        const seedStatsSample = async (channelID: string, ssrc: number, bytesSent: number) => {
            const report = new Map<string, any>([
                ['out-1', {id: 'out-1', type: 'outbound-rtp', ssrc, kind: 'audio', bytesSent}],
            ]);
            mockRoom.localParticipant.trackPublications = new Map([
                ['pub-0', {track: {
                    sid: 'mic',
                    source: 'microphone',
                    kind: 'audio',
                    mediaStream: {id: 's'},
                    mediaStreamTrack: {id: 'm', kind: 'audio', label: '', enabled: true, readyState: 'live'},
                    getRTCStatsReport: jest.fn().mockResolvedValue(report),
                }}],
            ]);
            client.channelID = channelID;
            await (client as any).pollStats();
        };

        it('flushes the last sampled stats on a clean (user-initiated) disconnect', async () => {
            await client.connect({channelID: 'clean'});
            mockRoom.state = ConnectionState.Connected;
            mockRoom.fire(RoomEvent.Connected);

            await seedStatsSample('clean', 99, 42);

            const storage = getPersistentStorage();
            storage.removeItem(STORAGE_CALLS_CLIENT_STATS_KEY);
            storage.removeItem(STORAGE_CALLS_CLIENT_LOGS_KEY);

            client.disconnect();
            expect(mockRoom.disconnect).toHaveBeenCalled();

            // Teardown (and the stats/log flush) is driven by the resulting room event.
            mockRoom.fire(RoomEvent.Disconnected);

            const stored = JSON.parse(storage.getItem(STORAGE_CALLS_CLIENT_STATS_KEY) || '{}');
            expect(stored.channelID).toBe('clean');
            expect(stored.rtcStats.ssrcStats[99].local.out).toMatchObject({bytesSent: 42});
            expect(storage.getItem(STORAGE_CALLS_CLIENT_LOGS_KEY)).toContain('--- Call Stats ---');
        });

        it('samples stats while connected and logs the last sample on remote teardown', async () => {
            await client.connect({channelID: 'remote-end'});
            mockRoom.fire(RoomEvent.Connected);

            // Polling is active while the call is connected.
            expect((client as any).statsPollTimer).not.toBeNull();

            await seedStatsSample('remote-end', 7, 123);

            const storage = getPersistentStorage();
            storage.removeItem(STORAGE_CALLS_CLIENT_STATS_KEY);
            storage.removeItem(STORAGE_CALLS_CLIENT_LOGS_KEY);

            // Remote teardown: Disconnected arrives without disconnect() being called,
            // so a fresh getStats() could no longer reach the (gone) peer connections.
            mockRoom.fire(RoomEvent.Disconnected);

            // Polling stopped, and the last sample was persisted + folded into the log buffer.
            expect((client as any).statsPollTimer).toBeNull();
            const stored = JSON.parse(storage.getItem(STORAGE_CALLS_CLIENT_STATS_KEY) || '{}');
            expect(stored.channelID).toBe('remote-end');
            expect(stored.rtcStats.ssrcStats[7].local.out).toMatchObject({bytesSent: 123});
            expect(storage.getItem(STORAGE_CALLS_CLIENT_LOGS_KEY)).toContain('--- Call Stats ---');
        });

        it('clears stale persisted stats when the call tears down before any sample', () => {
            const storage = getPersistentStorage();

            // Stats left over from an earlier call.
            storage.setItem(STORAGE_CALLS_CLIENT_STATS_KEY, JSON.stringify({channelID: 'old-call'}));

            // Disconnect before RoomEvent.Connected ever fired (failed/cancelled join):
            // polling never started, so lastStats is null and there is no fresh sample.
            mockRoom.fire(RoomEvent.Disconnected);

            // The stale entry is cleared rather than served by a later `/call stats`.
            expect(storage.getItem(STORAGE_CALLS_CLIENT_STATS_KEY)).toBeNull();
        });

        it('takes an immediate stats sample with ICE candidate pairs on connect', async () => {
            await client.connect({channelID: 'ice'});

            // A subscribed track present at connect time, whose report carries a
            // candidate pair — so the very first sample includes ICE stats.
            const report = new Map<string, any>([
                ['cp-1', {id: 'cp-1', type: 'candidate-pair', state: 'succeeded', nominated: true, localCandidateId: 'lc', remoteCandidateId: 'rc'}],
                ['lc', {id: 'lc', type: 'local-candidate', candidateType: 'host'}],
                ['rc', {id: 'rc', type: 'remote-candidate', candidateType: 'srflx'}],
            ]);
            mockRoom.localParticipant.trackPublications = new Map([
                ['pub-0', {track: {
                    sid: 'mic',
                    source: 'microphone',
                    kind: 'audio',
                    mediaStream: {id: 's'},
                    mediaStreamTrack: {id: 'm', kind: 'audio', label: '', enabled: true, readyState: 'live'},
                    getRTCStatsReport: jest.fn().mockResolvedValue(report),
                }}],
            ]);

            // handleConnected starts polling, which takes an immediate sample.
            mockRoom.fire(RoomEvent.Connected);

            // Let the immediate poll's microtasks settle — no timer advance needed.
            await new Promise((resolve) => setImmediate(resolve));

            expect((client as any).lastStats.rtcStats.iceStats.succeeded).toHaveLength(1);
            expect((client as any).lastStats.rtcStats.iceStats.succeeded[0]).toMatchObject({
                local: {candidateType: 'host'},
                remote: {candidateType: 'srflx'},
            });
        });

        it('samples stats when the local mic publishes (first track on the transport)', async () => {
            await client.connect({channelID: 'mic-publish'});
            client.channelID = 'mic-publish';

            const report = new Map<string, any>([
                ['out-1', {id: 'out-1', type: 'outbound-rtp', ssrc: 55, kind: 'audio', bytesSent: 9}],
            ]);
            mockRoom.localParticipant.trackPublications = new Map([
                ['pub-0', {track: {
                    sid: 'mic',
                    source: 'microphone',
                    kind: 'audio',
                    mediaStream: {id: 's'},
                    mediaStreamTrack: {id: 'm', kind: 'audio', label: '', enabled: true, readyState: 'live'},
                    getRTCStatsReport: jest.fn().mockResolvedValue(report),
                }}],
            ]);

            // Fire LocalTrackPublished for the mic, which should trigger an immediate sample.
            mockRoom.fire(
                RoomEvent.LocalTrackPublished,
                {source: Track.Source.Microphone, isMuted: false, trackSid: 'mic', kind: 'audio', mimeType: 'audio/opus', track: {mediaStreamTrack: {id: 'm'}}},
                mockRoom.localParticipant,
            );

            await new Promise((resolve) => setImmediate(resolve));

            expect((client as any).lastStats.rtcStats.ssrcStats[55].local.out).toMatchObject({bytesSent: 9});
        });

        it('calls room.removeAllListeners() on disconnect to stop post-call devicechange events', async () => {
            await client.connect({channelID: 'test-channel'});
            mockRoom.state = ConnectionState.Connected;

            client.disconnect();
            mockRoom.fire(RoomEvent.Disconnected);

            expect(mockRoom.removeAllListeners).toHaveBeenCalled();
        });

        test('emits DISCONNECTED while the room is still set, so listeners can read getSessionID()', async () => {
            // index.tsx's DISCONNECTED listener calls getSessionID() to dispatch leaveUser for the
            // local session. getSessionID() reads this.room, so releasing the room before the emit
            // makes it return null and silently drops that dispatch.
            await client.connect({channelID: 'test-channel'});
            mockRoom.state = ConnectionState.Connected;

            const sessionIDAtEmit = jest.fn();
            client.on(CALL_EVENT.DISCONNECTED, () => sessionIDAtEmit(client.getSessionID()));

            client.disconnect();
            mockRoom.fire(RoomEvent.Disconnected);

            expect(sessionIDAtEmit).toHaveBeenCalledWith('me-session');
        });

        it('before the room connects, tears down directly (livekit room.disconnect would not emit)', () => {
            // The room sits in its initial Disconnected state for the whole pre-connect window;
            // livekit room.disconnect() is a silent no-op there, so disconnect() must drive
            // teardown itself or the call is left stuck on "Connecting…" (MM-69034).
            mockRoom.state = ConnectionState.Disconnected;

            const disconnectedListener = jest.fn();
            client.on(CALL_EVENT.DISCONNECTED, disconnectedListener);

            expect(client.isDisconnected).toBe(false);
            client.disconnect();

            expect(mockRoom.disconnect).not.toHaveBeenCalled();
            expect(client.isDisconnected).toBe(true);
            expect(disconnectedListener).toHaveBeenCalled();
        });

        it('cancelling mid-connect bails quietly without emitting ERROR', async () => {
            mockRoom.state = ConnectionState.Disconnected;

            // Hold the join request open so we can cancel while still "Connecting…".
            let rejectSession: (e: Error) => void = () => {};
            (RestClient.fetch as jest.Mock).mockImplementationOnce(
                () => new Promise((_resolve, reject) => {
                    rejectSession = reject;
                }),
            );

            const errorListener = jest.fn();
            client.on(CALL_EVENT.ERROR, errorListener);

            const connectPromise = client.connect({channelID: 'test-channel'});

            // User hangs up before the room connected → direct teardown.
            client.disconnect();

            rejectSession(new Error('request aborted'));

            await expect(connectPromise).resolves.toBeUndefined();
            expect(errorListener).not.toHaveBeenCalled();
            expect(client.isDisconnected).toBe(true);
        });
    });

    describe('Connected event', () => {
        it('exposes isConnected === true to CONNECTED subscribers even when Connected fires mid-connect', async () => {
            // Real LiveKit emits RoomEvent.Connected synchronously inside room.connect(),
            // before that promise resolves and before connect() can flip this.connected.
            // Reproduce that ordering by firing it from within the mocked connect(): a
            // CONNECTED subscriber must still observe isConnected === true.
            let observedIsConnected: boolean | undefined;
            client.on(CALL_EVENT.CONNECTED, () => {
                observedIsConnected = client.isConnected;
            });

            mockRoom.connect.mockImplementationOnce(async () => {
                mockRoom.fire(RoomEvent.Connected);
                return null;
            });

            await client.connect({channelID: 'test-channel'});

            expect(observedIsConnected).toBe(true);
        });

        it('treats absent mic publication as muted', async () => {
            mockRoom.localParticipant.getTrackPublication.mockReturnValue(null);
            const muteListener = jest.fn();
            client.on(CALL_EVENT.MUTE, muteListener);

            await client.connect({channelID: 'test-channel'});
            mockRoom.fire(RoomEvent.Connected);

            // session_id and user_id are parsed out of participant.identity ("userID___sessionID").
            expect(muteListener).toHaveBeenCalledWith('me-session', 'me-id');
        });

        it('seeds USER_JOINED + MUTE for each remote participant in the room', async () => {
            mockRoom.localParticipant.getTrackPublication.mockReturnValue({isMuted: false});
            mockRoom.remoteParticipants.set('r1', {
                sid: 'r1-sid',
                identity: 'remote-1___r1-session',
                getTrackPublication: jest.fn(() => ({isMuted: true})),
            });
            mockRoom.remoteParticipants.set('r2', {
                sid: 'r2-sid',
                identity: 'remote-2___r2-session',
                getTrackPublication: jest.fn(() => ({isMuted: false})),
            });

            const userJoinedListener = jest.fn();
            const muteListener = jest.fn();
            const unmuteListener = jest.fn();
            client.on(CALL_EVENT.USER_JOINED, userJoinedListener);
            client.on(CALL_EVENT.MUTE, muteListener);
            client.on(CALL_EVENT.UNMUTE, unmuteListener);

            await client.connect({channelID: 'test-channel'});
            mockRoom.fire(RoomEvent.Connected);

            expect(userJoinedListener).toHaveBeenCalledWith('r1-session', 'remote-1', true);
            expect(muteListener).toHaveBeenCalledWith('r1-session', 'remote-1');
            expect(userJoinedListener).toHaveBeenCalledWith('r2-session', 'remote-2', true);
            expect(unmuteListener).toHaveBeenCalledWith('r2-session', 'remote-2');
        });
    });

    describe('TrackMuted / TrackUnmuted', () => {
        it('emits MUTE with (session_id, user_id) parsed from identity when mic track is muted', async () => {
            await client.connect({channelID: 'test-channel'});
            const muteListener = jest.fn();
            client.on(CALL_EVENT.MUTE, muteListener);

            mockRoom.fire(
                RoomEvent.TrackMuted,
                {source: Track.Source.Microphone},
                {sid: 'p1-sid', identity: 'user1___p1-session'},
            );

            expect(muteListener).toHaveBeenCalledWith('p1-session', 'user1');
        });

        it('emits UNMUTE with (session_id, user_id) parsed from identity when mic track is unmuted', async () => {
            await client.connect({channelID: 'test-channel'});
            const unmuteListener = jest.fn();
            client.on(CALL_EVENT.UNMUTE, unmuteListener);

            mockRoom.fire(
                RoomEvent.TrackUnmuted,
                {source: Track.Source.Microphone},
                {sid: 'p1-sid', identity: 'user1___p1-session'},
            );

            expect(unmuteListener).toHaveBeenCalledWith('p1-session', 'user1');
        });

        it('does not emit when a non-microphone track is muted', async () => {
            await client.connect({channelID: 'test-channel'});
            const muteListener = jest.fn();
            client.on(CALL_EVENT.MUTE, muteListener);

            mockRoom.fire(
                RoomEvent.TrackMuted,
                {source: Track.Source.ScreenShare},
                {sid: 'p1-sid', identity: 'user1___p1-session'},
            );

            expect(muteListener).not.toHaveBeenCalled();
        });
    });

    describe('TrackPublished / TrackUnpublished (remote)', () => {
        it('emits MUTE for a freshly-published muted mic publication', async () => {
            await client.connect({channelID: 'test-channel'});
            const muteListener = jest.fn();
            client.on(CALL_EVENT.MUTE, muteListener);

            mockRoom.fire(
                RoomEvent.TrackPublished,
                {source: Track.Source.Microphone, isMuted: true},
                {sid: 'p1-sid', identity: 'user1___p1-session'},
            );

            expect(muteListener).toHaveBeenCalledWith('p1-session', 'user1');
        });

        it('emits UNMUTE for a freshly-published unmuted mic publication (covers first-unmute)', async () => {
            await client.connect({channelID: 'test-channel'});
            const unmuteListener = jest.fn();
            client.on(CALL_EVENT.UNMUTE, unmuteListener);

            mockRoom.fire(
                RoomEvent.TrackPublished,
                {source: Track.Source.Microphone, isMuted: false},
                {sid: 'p1-sid', identity: 'user1___p1-session'},
            );

            expect(unmuteListener).toHaveBeenCalledWith('p1-session', 'user1');
        });

        it('emits MUTE when a remote unpublishes (no track == muted)', async () => {
            await client.connect({channelID: 'test-channel'});
            const muteListener = jest.fn();
            client.on(CALL_EVENT.MUTE, muteListener);

            mockRoom.fire(
                RoomEvent.TrackUnpublished,
                {source: Track.Source.Microphone},
                {sid: 'p1-sid', identity: 'user1___p1-session'},
            );

            expect(muteListener).toHaveBeenCalledWith('p1-session', 'user1');
        });
    });

    describe('LocalTrackPublished / LocalTrackUnpublished', () => {
        it('emits UNMUTE when local mic is published unmuted', async () => {
            await client.connect({channelID: 'test-channel'});
            const unmuteListener = jest.fn();
            client.on(CALL_EVENT.UNMUTE, unmuteListener);

            const mediaStreamTrack = {} as MediaStreamTrack;
            mockRoom.fire(
                RoomEvent.LocalTrackPublished,
                {
                    source: Track.Source.Microphone,
                    isMuted: false,
                    track: {mediaStreamTrack},
                },
                mockRoom.localParticipant,
            );

            // session_id and user_id are parsed out of participant.identity ("userID___sessionID").
            expect(unmuteListener).toHaveBeenCalledWith('me-session', 'me-id');
        });

        it('emits MUTE on local unpublish', async () => {
            await client.connect({channelID: 'test-channel'});
            const muteListener = jest.fn();
            client.on(CALL_EVENT.MUTE, muteListener);

            mockRoom.fire(
                RoomEvent.LocalTrackUnpublished,
                {source: Track.Source.Microphone},
                mockRoom.localParticipant,
            );

            // session_id and user_id are parsed out of participant.identity ("userID___sessionID").
            expect(muteListener).toHaveBeenCalledWith('me-session', 'me-id');
        });

        it('does nothing for non-microphone local tracks', async () => {
            await client.connect({channelID: 'test-channel'});
            const muteListener = jest.fn();
            const unmuteListener = jest.fn();
            client.on(CALL_EVENT.MUTE, muteListener);
            client.on(CALL_EVENT.UNMUTE, unmuteListener);

            mockRoom.fire(
                RoomEvent.LocalTrackPublished,
                {source: Track.Source.ScreenShare},
                mockRoom.localParticipant,
            );

            expect(muteListener).not.toHaveBeenCalled();
            expect(unmuteListener).not.toHaveBeenCalled();
        });
    });

    describe('TrackSubscribed (remote audio routing)', () => {
        it('emits REMOTE_VOICE_STREAM with stream + session_id + user_id parsed from identity for mic source', async () => {
            await client.connect({channelID: 'test-channel'});
            const remoteVoiceListener = jest.fn();
            client.on(CALL_EVENT.REMOTE_VOICE_STREAM, remoteVoiceListener);

            mockRoom.fire(
                RoomEvent.TrackSubscribed,
                {source: Track.Source.Microphone, mediaStreamTrack: {}},
                {},
                {sid: 'p1-sid', identity: 'user1___p1-session'},
            );

            expect(remoteVoiceListener).toHaveBeenCalledWith(expect.anything(), 'p1-session', 'user1');
        });

        it('does not emit for non-microphone tracks', async () => {
            await client.connect({channelID: 'test-channel'});
            const remoteVoiceListener = jest.fn();
            client.on(CALL_EVENT.REMOTE_VOICE_STREAM, remoteVoiceListener);

            mockRoom.fire(
                RoomEvent.TrackSubscribed,
                {source: Track.Source.ScreenShare, mediaStreamTrack: {}},
                {},
                {sid: 'p1-sid', identity: 'user1___p1-session', getTrackPublication: () => null},
            );

            expect(remoteVoiceListener).not.toHaveBeenCalled();
        });
    });

    describe('ParticipantConnected / ParticipantDisconnected', () => {
        it('emits USER_JOINED (no isFromInitialSync) for live remote join', async () => {
            await client.connect({channelID: 'test-channel'});
            const userJoinedListener = jest.fn();
            client.on(CALL_EVENT.USER_JOINED, userJoinedListener);

            mockRoom.fire(RoomEvent.ParticipantConnected, {sid: 'p1-sid', identity: 'user1___p1-session'});

            expect(userJoinedListener).toHaveBeenCalledWith('p1-session', 'user1');
        });

        it('emits USER_LEFT when a remote participant disconnects', async () => {
            await client.connect({channelID: 'test-channel'});
            const userLeftListener = jest.fn();
            client.on(CALL_EVENT.USER_LEFT, userLeftListener);

            mockRoom.fire(RoomEvent.ParticipantDisconnected, {sid: 'p1-sid', identity: 'user1___p1-session'});

            expect(userLeftListener).toHaveBeenCalledWith('p1-session', 'user1');
        });
    });

    describe('raise / lower hand (participant attributes)', () => {
        it('raiseHand sets the raised_hand attribute to a positive timestamp', async () => {
            await client.connect({channelID: 'test-channel'});

            await client.raiseHand();

            expect(mockRoom.localParticipant.setAttributes).toHaveBeenCalledTimes(1);
            const arg = mockRoom.localParticipant.setAttributes.mock.calls[0][0];
            expect(Number(arg.raised_hand)).toBeGreaterThan(0);
        });

        it('unraiseHand clears the raised_hand attribute', async () => {
            await client.connect({channelID: 'test-channel'});

            await client.unraiseHand();

            expect(mockRoom.localParticipant.setAttributes).toHaveBeenCalledWith({raised_hand: ''});
        });

        it('does nothing when the room is not connected', async () => {
            await client.raiseHand();
            await client.unraiseHand();

            expect(mockRoom.localParticipant.setAttributes).not.toHaveBeenCalled();
        });

        it('emits RAISE_HAND (session_id, user_id, timestamp) when raised_hand becomes positive', async () => {
            await client.connect({channelID: 'test-channel'});
            const raiseListener = jest.fn();
            client.on(CALL_EVENT.RAISE_HAND, raiseListener);

            mockRoom.fire(
                RoomEvent.ParticipantAttributesChanged,
                {raised_hand: '1700000000000'},
                {sid: 'p1-sid', identity: 'user1___p1-session'},
            );

            expect(raiseListener).toHaveBeenCalledWith('p1-session', 'user1', 1700000000000);
        });

        it('emits LOWER_HAND when raised_hand is cleared', async () => {
            await client.connect({channelID: 'test-channel'});
            const lowerListener = jest.fn();
            client.on(CALL_EVENT.LOWER_HAND, lowerListener);

            mockRoom.fire(
                RoomEvent.ParticipantAttributesChanged,
                {raised_hand: ''},
                {sid: 'p1-sid', identity: 'user1___p1-session'},
            );

            expect(lowerListener).toHaveBeenCalledWith('p1-session', 'user1');
        });

        it('ignores attribute changes that do not touch raised_hand', async () => {
            await client.connect({channelID: 'test-channel'});
            const raiseListener = jest.fn();
            const lowerListener = jest.fn();
            client.on(CALL_EVENT.RAISE_HAND, raiseListener);
            client.on(CALL_EVENT.LOWER_HAND, lowerListener);

            mockRoom.fire(
                RoomEvent.ParticipantAttributesChanged,
                {some_other_attr: 'x'},
                {sid: 'p1-sid', identity: 'user1___p1-session'},
            );

            expect(raiseListener).not.toHaveBeenCalled();
            expect(lowerListener).not.toHaveBeenCalled();
        });

        it('seeds RAISE_HAND on connect for a remote participant whose hand is already raised', async () => {
            mockRoom.localParticipant.getTrackPublication.mockReturnValue({isMuted: false});
            mockRoom.remoteParticipants.set('r1', {
                sid: 'r1-sid',
                identity: 'remote-1___r1-session',
                getTrackPublication: jest.fn(() => ({isMuted: false})),
                attributes: {raised_hand: '1700000000123'},
            });
            const raiseListener = jest.fn();
            client.on(CALL_EVENT.RAISE_HAND, raiseListener);

            await client.connect({channelID: 'test-channel'});
            mockRoom.fire(RoomEvent.Connected);

            expect(raiseListener).toHaveBeenCalledWith('r1-session', 'remote-1', 1700000000123);
        });
    });

    describe('reactions (data messages)', () => {
        const emoji: EmojiData = {name: '+1', unified: '1f44d', literal: '👍'};

        it('publishes a reaction as a reliable data message on the reaction topic', async () => {
            await client.connect({channelID: 'test-channel'});

            await client.sendReaction(emoji);

            expect(mockRoom.localParticipant.publishData).toHaveBeenCalledTimes(1);
            const [payload, opts] = mockRoom.localParticipant.publishData.mock.calls[0];
            expect(opts).toEqual(expect.objectContaining({reliable: true, topic: 'reaction'}));

            const decoded = JSON.parse(new TextDecoder().decode(payload));
            expect(decoded.emojiData).toEqual(emoji);
            expect(typeof decoded.timestamp).toBe('number');
        });

        it('locally echoes the sender\'s own reaction (publishData does not loop back)', async () => {
            await client.connect({channelID: 'test-channel'});
            const reactionListener = jest.fn();
            client.on(CALL_EVENT.REACTION, reactionListener);

            await client.sendReaction(emoji);

            expect(reactionListener).toHaveBeenCalledWith('me-session', 'me-id', emoji, expect.any(Number));
        });

        it('does nothing when the room is not connected', async () => {
            await client.sendReaction(emoji);

            expect(mockRoom.localParticipant.publishData).not.toHaveBeenCalled();
        });

        it('emits REACTION on DataReceived for the reaction topic', async () => {
            await client.connect({channelID: 'test-channel'});
            const reactionListener = jest.fn();
            client.on(CALL_EVENT.REACTION, reactionListener);

            const payload = new TextEncoder().encode(JSON.stringify({emojiData: emoji, timestamp: 1700000000000}));
            mockRoom.fire(
                RoomEvent.DataReceived,
                payload,
                {sid: 'p1-sid', identity: 'user1___p1-session'},
                undefined,
                'reaction',
            );

            expect(reactionListener).toHaveBeenCalledWith('p1-session', 'user1', emoji, 1700000000000);
        });

        it('ignores DataReceived for other topics', async () => {
            await client.connect({channelID: 'test-channel'});
            const reactionListener = jest.fn();
            client.on(CALL_EVENT.REACTION, reactionListener);

            const payload = new TextEncoder().encode(JSON.stringify({emojiData: emoji, timestamp: 1}));
            mockRoom.fire(
                RoomEvent.DataReceived,
                payload,
                {sid: 'p1-sid', identity: 'user1___p1-session'},
                undefined,
                'some-other-topic',
            );

            expect(reactionListener).not.toHaveBeenCalled();
        });
    });

    describe('reSyncMuteAndHandState (popout overlay)', () => {
        it('re-emits mute + raised-hand for all participants WITHOUT USER_JOINED', async () => {
            mockRoom.localParticipant.getTrackPublication.mockReturnValue({isMuted: false});
            mockRoom.localParticipant.attributes = {};
            mockRoom.remoteParticipants.set('r1', {
                sid: 'r1-sid',
                identity: 'remote-1___r1-session',
                getTrackPublication: jest.fn(() => ({isMuted: true})),
                attributes: {raised_hand: '1700000000999'},
            });

            await client.connect({channelID: 'test-channel'});

            const userJoinedListener = jest.fn();
            const muteListener = jest.fn();
            const unmuteListener = jest.fn();
            const raiseListener = jest.fn();
            client.on(CALL_EVENT.USER_JOINED, userJoinedListener);
            client.on(CALL_EVENT.MUTE, muteListener);
            client.on(CALL_EVENT.UNMUTE, unmuteListener);
            client.on(CALL_EVENT.RAISE_HAND, raiseListener);

            client.reSyncMuteAndHandState();

            expect(unmuteListener).toHaveBeenCalledWith('me-session', 'me-id');
            expect(muteListener).toHaveBeenCalledWith('r1-session', 'remote-1');
            expect(raiseListener).toHaveBeenCalledWith('r1-session', 'remote-1', 1700000000999);

            // Must NOT re-create sessions — that would reset voice/reaction state.
            expect(userJoinedListener).not.toHaveBeenCalled();
        });
    });

    describe('MediaDevicesError', () => {
        it('emits ERROR with the underlying error', async () => {
            await client.connect({channelID: 'test-channel'});
            const errorListener = jest.fn();
            client.on(CALL_EVENT.ERROR, errorListener);

            const err = new Error('mic unplugged');
            mockRoom.fire(RoomEvent.MediaDevicesError, err);

            expect(errorListener).toHaveBeenCalledWith(err);
        });
    });

    describe('getRemoteVoiceTracks', () => {
        it('returns empty array before the room is connected', () => {
            expect(client.getRemoteVoiceTracks()).toEqual([]);
        });

        it('returns live mic tracks from remote participants', async () => {
            const liveTrack = {readyState: 'live'} as MediaStreamTrack;
            mockRoom.remoteParticipants.set('p1', {
                audioTrackPublications: new Map([
                    [
                        't1',
                        {
                            source: Track.Source.Microphone,
                            isSubscribed: true,
                            track: {mediaStreamTrack: liveTrack},
                        },
                    ],
                ]),
            });

            await client.connect({channelID: 'test-channel'});

            expect(client.getRemoteVoiceTracks()).toEqual([liveTrack]);
        });

        it('skips ended, unsubscribed, and non-mic tracks', async () => {
            mockRoom.remoteParticipants.set('p1', {
                audioTrackPublications: new Map([
                    [
                        'ended',
                        {
                            source: Track.Source.Microphone,
                            isSubscribed: true,
                            track: {mediaStreamTrack: {readyState: 'ended'}},
                        },
                    ],
                    [
                        'unsub',
                        {
                            source: Track.Source.Microphone,
                            isSubscribed: false,
                            track: {mediaStreamTrack: {readyState: 'live'}},
                        },
                    ],
                    [
                        'nonmic',
                        {
                            source: Track.Source.ScreenShareAudio,
                            isSubscribed: true,
                            track: {mediaStreamTrack: {readyState: 'live'}},
                        },
                    ],
                ]),
            });

            await client.connect({channelID: 'test-channel'});

            expect(client.getRemoteVoiceTracks()).toEqual([]);
        });
    });

    describe('ActiveSpeakersChanged', () => {
        it('emits USERS_VOICE_ACTIVITY_CHANGED with parallel session_ids and user_ids arrays', async () => {
            await client.connect({channelID: 'test-channel'});
            const listener = jest.fn();
            client.on(CALL_EVENT.USERS_VOICE_ACTIVITY_CHANGED, listener);

            mockRoom.fire(RoomEvent.ActiveSpeakersChanged, [
                {sid: 'p1-sid', identity: 'u1___p1-session'},
                {sid: 'p2-sid', identity: 'u2___p2-session'},
            ]);

            expect(listener).toHaveBeenCalledWith(['p1-session', 'p2-session'], ['u1', 'u2']);
        });

        it('emits empty arrays when no one is speaking', async () => {
            await client.connect({channelID: 'test-channel'});
            const listener = jest.fn();
            client.on(CALL_EVENT.USERS_VOICE_ACTIVITY_CHANGED, listener);

            mockRoom.fire(RoomEvent.ActiveSpeakersChanged, []);

            expect(listener).toHaveBeenCalledWith([], []);
        });
    });

    describe('ConnectionQualityChanged', () => {
        it('emits QUALITY_CHANGED for the local participant', async () => {
            await client.connect({channelID: 'test-channel'});
            const listener = jest.fn();
            client.on(CALL_EVENT.QUALITY_CHANGED, listener);

            mockRoom.fire(RoomEvent.ConnectionQualityChanged, ConnectionQuality.Poor, mockRoom.localParticipant);

            expect(listener).toHaveBeenCalledWith(ConnectionQuality.Poor);
        });

        it('ignores quality updates for remote participants', async () => {
            await client.connect({channelID: 'test-channel'});
            const listener = jest.fn();
            client.on(CALL_EVENT.QUALITY_CHANGED, listener);

            mockRoom.fire(RoomEvent.ConnectionQualityChanged, ConnectionQuality.Poor, {sid: 'r1-sid', identity: 'r1___r1-session'});

            expect(listener).not.toHaveBeenCalled();
        });
    });

    describe('audio devices', () => {
        const inputDevice: MediaDeviceInfo = {
            deviceId: 'mic-1',
            kind: 'audioinput',
            label: 'Built-in Mic',
            groupId: 'g1',
            toJSON: () => ({}),
        } as MediaDeviceInfo;

        const inputDevice2: MediaDeviceInfo = {
            deviceId: 'mic-2',
            kind: 'audioinput',
            label: 'USB Mic',
            groupId: 'g2',
            toJSON: () => ({}),
        } as MediaDeviceInfo;

        const outputDevice: MediaDeviceInfo = {
            deviceId: 'spk-1',
            kind: 'audiooutput',
            label: 'Built-in Speakers',
            groupId: 'g3',
            toJSON: () => ({}),
        } as MediaDeviceInfo;

        it('returns empty audio devices before any enumeration', () => {
            expect(client.getAudioDevices()).toEqual({inputs: [], outputs: []});
        });

        it('partitions enumerated devices into inputs and outputs after connect', async () => {
            (navigator.mediaDevices.enumerateDevices as jest.Mock).mockResolvedValue([
                inputDevice,
                outputDevice,
                inputDevice2,
            ]);

            await client.connect({channelID: 'test-channel'});

            // Enumeration runs from handleConnected → ensureMicrophoneTrack,
            // which only fires after LiveKit emits Connected.
            mockRoom.fire(RoomEvent.Connected);
            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(client.getAudioDevices()).toEqual({
                inputs: [inputDevice, inputDevice2],
                outputs: [outputDevice],
            });
        });

        it('logs the resolved audio input/output device counts after enumeration', async () => {
            (navigator.mediaDevices.enumerateDevices as jest.Mock).mockResolvedValue([
                inputDevice,
                outputDevice,
                inputDevice2,
            ]);
            const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});

            await client.connect({channelID: 'test-channel'});
            mockRoom.fire(RoomEvent.Connected);
            await new Promise((resolve) => setTimeout(resolve, 0));

            const logged = debugSpy.mock.calls.map((args) => args.join(' '));
            expect(logged).toEqual(expect.arrayContaining([expect.stringContaining('enumerated audio devices: 2 input(s), 1 output(s)')]));

            debugSpy.mockRestore();
        });

        it('logs zero input devices so the inert-mic-button condition is visible', async () => {
            (navigator.mediaDevices.enumerateDevices as jest.Mock).mockResolvedValue([outputDevice]);
            const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});

            await client.connect({channelID: 'test-channel'});
            mockRoom.fire(RoomEvent.Connected);
            await new Promise((resolve) => setTimeout(resolve, 0));

            const logged = debugSpy.mock.calls.map((args) => args.join(' '));
            expect(logged).toEqual(expect.arrayContaining([expect.stringContaining('enumerated audio devices: 0 input(s), 1 output(s)')]));

            debugSpy.mockRestore();
        });

        it('setAudioInputDevice persists, switches the LiveKit device, and emits DEVICE_CHANGE', async () => {
            await client.connect({channelID: 'test-channel'});
            const deviceChangeListener = jest.fn();
            client.on(CALL_EVENT.DEVICE_CHANGE, deviceChangeListener);

            await client.setAudioInputDevice(inputDevice);

            // The 3rd arg (exact=true) was added so LiveKit treats a missing
            // device as an error instead of silently falling back.
            expect(mockRoom.switchActiveDevice).toHaveBeenCalledWith('audioinput', 'mic-1', true);
            expect(client.currentAudioInputDevice).toBe(inputDevice);
            expect(window.localStorage.getItem(STORAGE_CALLS_DEFAULT_AUDIO_INPUT_KEY))
                .toBe(JSON.stringify({deviceId: 'mic-1', label: 'Built-in Mic'}));
            expect(deviceChangeListener).toHaveBeenCalled();
        });

        it('setAudioInputDevice leaves state unchanged when the LiveKit switch rejects', async () => {
            await client.connect({channelID: 'test-channel'});
            const deviceChangeListener = jest.fn();
            client.on(CALL_EVENT.DEVICE_CHANGE, deviceChangeListener);
            mockRoom.switchActiveDevice.mockRejectedValueOnce(new Error('device not found'));

            await client.setAudioInputDevice(inputDevice);

            expect(mockRoom.switchActiveDevice).toHaveBeenCalledWith('audioinput', 'mic-1', true);

            // The switch failed, so the previous active device and storage must be untouched.
            expect(client.currentAudioInputDevice).not.toBe(inputDevice);
            expect(window.localStorage.getItem(STORAGE_CALLS_DEFAULT_AUDIO_INPUT_KEY)).toBeNull();
            expect(deviceChangeListener).not.toHaveBeenCalled();
        });

        it('setAudioInputDevice with store=false skips the localStorage write', async () => {
            await client.connect({channelID: 'test-channel'});

            await client.setAudioInputDevice(inputDevice, false);

            expect(window.localStorage.getItem(STORAGE_CALLS_DEFAULT_AUDIO_INPUT_KEY)).toBeNull();
            expect(client.currentAudioInputDevice).toBe(inputDevice);
        });

        it('setAudioOutputDevice does NOT call switchActiveDevice (sinkId stays in widget)', async () => {
            await client.connect({channelID: 'test-channel'});
            const deviceChangeListener = jest.fn();
            client.on(CALL_EVENT.DEVICE_CHANGE, deviceChangeListener);
            mockRoom.switchActiveDevice.mockClear();

            await client.setAudioOutputDevice(outputDevice);

            expect(mockRoom.switchActiveDevice).not.toHaveBeenCalled();
            expect(client.currentAudioOutputDevice).toBe(outputDevice);
            expect(window.localStorage.getItem(STORAGE_CALLS_DEFAULT_AUDIO_OUTPUT_KEY))
                .toBe(JSON.stringify({deviceId: 'spk-1', label: 'Built-in Speakers'}));
            expect(deviceChangeListener).toHaveBeenCalled();
        });

        it('restores stored input/output devices on connect when present in the enumerated list', async () => {
            window.localStorage.setItem(STORAGE_CALLS_DEFAULT_AUDIO_INPUT_KEY, JSON.stringify({deviceId: 'mic-2', label: 'USB Mic'}));
            window.localStorage.setItem(STORAGE_CALLS_DEFAULT_AUDIO_OUTPUT_KEY, JSON.stringify({deviceId: 'spk-1', label: 'Built-in Speakers'}));
            (navigator.mediaDevices.enumerateDevices as jest.Mock).mockResolvedValue([inputDevice, inputDevice2, outputDevice]);

            await client.connect({channelID: 'test-channel'});

            // Device restore runs from handleConnected → ensureMicrophoneTrack,
            // which only fires after LiveKit emits Connected.
            mockRoom.fire(RoomEvent.Connected);
            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(client.currentAudioInputDevice).toBe(inputDevice2);
            expect(client.currentAudioOutputDevice).toBe(outputDevice);
            expect(mockRoom.switchActiveDevice).toHaveBeenCalledWith('audioinput', 'mic-2', true);
        });

        it('falls back to the first input when the active input is unplugged', async () => {
            (navigator.mediaDevices.enumerateDevices as jest.Mock).mockResolvedValue([inputDevice, inputDevice2]);
            await client.connect({channelID: 'test-channel'});
            await client.setAudioInputDevice(inputDevice);

            const fallbackListener = jest.fn();
            const deviceChangeListener = jest.fn();
            client.on(CALL_EVENT.DEVICE_FALLBACK, fallbackListener);
            client.on(CALL_EVENT.DEVICE_CHANGE, deviceChangeListener);

            (navigator.mediaDevices.enumerateDevices as jest.Mock).mockResolvedValue([inputDevice2]);
            mockRoom.fire(RoomEvent.MediaDevicesChanged);

            // Wait for the async handler to complete.
            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(fallbackListener).toHaveBeenCalledWith(inputDevice);
            expect(client.currentAudioInputDevice).toBe(inputDevice2);
            expect(deviceChangeListener).toHaveBeenCalled();
        });

        it('emits only DEVICE_CHANGE when the device list changes but the active one is still present', async () => {
            (navigator.mediaDevices.enumerateDevices as jest.Mock).mockResolvedValue([inputDevice]);
            await client.connect({channelID: 'test-channel'});
            await client.setAudioInputDevice(inputDevice);

            const fallbackListener = jest.fn();
            const deviceChangeListener = jest.fn();
            client.on(CALL_EVENT.DEVICE_FALLBACK, fallbackListener);
            client.on(CALL_EVENT.DEVICE_CHANGE, deviceChangeListener);

            (navigator.mediaDevices.enumerateDevices as jest.Mock).mockResolvedValue([inputDevice, inputDevice2]);
            mockRoom.fire(RoomEvent.MediaDevicesChanged);
            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(fallbackListener).not.toHaveBeenCalled();
            expect(deviceChangeListener).toHaveBeenCalled();
        });
    });

    describe('ensureMicrophoneTrack', () => {
        it('mutex prevents double publishTrack when Connected and MediaDevicesChanged race concurrently (Safari)', async () => {
            // Safari does not expose mic devices via enumerateDevices() until permission is
            // granted, so the initial input count is 0. When the user clicks Allow, Safari
            // fires mediadeviceschange — which triggers a second ensureMicrophoneTrack() call
            // while the first (from handleConnected) is still suspended inside getUserMedia().
            // Both calls would otherwise race past the !getTrackPublication guard and publish
            // two tracks. The micTrackEnsureInProgress mutex must block the second call.

            let resolveGetUserMedia!: (stream: any) => void;

            // First getUserMedia call (from handleConnected) is deferred until we manually
            // resolve it. Second call (if the mutex fails) would resolve immediately with a
            // track, proving a second publishTrack was attempted.
            (navigator.mediaDevices.getUserMedia as jest.Mock)
                .mockReturnValueOnce(new Promise((resolve) => {
                    resolveGetUserMedia = resolve;
                }))
                .mockResolvedValueOnce({getTracks: () => [{stop: jest.fn()}]});

            // Simulate Safari: no inputs visible before permission.
            (navigator.mediaDevices.enumerateDevices as jest.Mock).mockResolvedValue([]);

            await client.connect({channelID: 'test-channel'});

            // RoomEvent.Connected triggers the first ensureMicrophoneTrack(), which suspends
            // at the deferred getUserMedia and sets micTrackEnsureInProgress = true.
            mockRoom.fire(RoomEvent.Connected);

            // Permission is granted — Safari fires mediadeviceschange with the new input.
            // handleMediaDevicesChanged sees prevInputCount=0 → newCount=1 → no published
            // track → calls ensureMicrophoneTrack() again. The mutex must block it.
            const safariInputDevice: MediaDeviceInfo = {
                deviceId: 'mic-1', kind: 'audioinput', label: 'Built-in Mic', groupId: 'g1', toJSON: () => ({}),
            } as MediaDeviceInfo;
            (navigator.mediaDevices.enumerateDevices as jest.Mock).mockResolvedValue([safariInputDevice]);
            mockRoom.fire(RoomEvent.MediaDevicesChanged);

            // Let handleMediaDevicesChanged's enumerateDevices await settle.
            await new Promise((resolve) => setTimeout(resolve, 0));

            // Resolve getUserMedia — the first ensureMicrophoneTrack() completes and
            // publishes exactly one track.
            resolveGetUserMedia({getTracks: () => [{stop: jest.fn()}]});
            await new Promise((resolve) => setImmediate(resolve));

            expect(mockRoom.localParticipant.publishTrack).toHaveBeenCalledTimes(1);
        });
    });

    describe('room metadata', () => {
        const metadata = {
            host_id: 'host-user',
            recording: {type: 'recording', init_at: 1, start_at: 2, end_at: 0},
        };

        it('applies the metadata already on the room when it connects', async () => {
            mockRoom.metadata = JSON.stringify(metadata);
            const hostListener = jest.fn();
            const jobListener = jest.fn();
            client.on(CALL_EVENT.HOST_CHANGED, hostListener);
            client.on(CALL_EVENT.JOB_STATE, jobListener);

            await client.connect({channelID: 'test-channel'});
            mockRoom.fire(RoomEvent.Connected);

            // Metadata is delivered on connect, which is what lets it need no
            // separate resync path.
            expect(hostListener).toHaveBeenCalledWith('host-user');
            expect(jobListener).toHaveBeenCalledWith(metadata.recording);
        });

        it('applies subsequent metadata changes', async () => {
            await client.connect({channelID: 'test-channel'});
            const hostListener = jest.fn();
            client.on(CALL_EVENT.HOST_CHANGED, hostListener);

            mockRoom.fire(RoomEvent.RoomMetadataChanged, JSON.stringify({host_id: 'new-host'}));

            expect(hostListener).toHaveBeenCalledWith('new-host');
        });

        it('survives unparseable metadata without emitting', async () => {
            await client.connect({channelID: 'test-channel'});
            const hostListener = jest.fn();
            client.on(CALL_EVENT.HOST_CHANGED, hostListener);

            mockRoom.fire(RoomEvent.RoomMetadataChanged, 'not json');

            expect(hostListener).not.toHaveBeenCalled();
        });
    });

    describe('host control messages', () => {
        const encode = (payload: unknown) => new TextEncoder().encode(JSON.stringify(payload));

        it('stops the local screen share on a stop_screenshare command', async () => {
            await client.connect({channelID: 'test-channel'});

            // The server sends this through the admin API, so there is no sending
            // participant — the handler must not treat that as a reason to drop it.
            mockRoom.fire(
                RoomEvent.DataReceived,
                encode({action: 'stop_screenshare'}),
                undefined,
                undefined,
                CALL_MESSAGE_TOPICS.HOST_CONTROL,
            );

            await new Promise((resolve) => setImmediate(resolve));

            expect(mockRoom.localParticipant.setScreenShareEnabled).toHaveBeenCalledWith(false);
        });

        it('ignores an unknown action', async () => {
            await client.connect({channelID: 'test-channel'});

            mockRoom.fire(
                RoomEvent.DataReceived,
                encode({action: 'do_something_else'}),
                undefined,
                undefined,
                CALL_MESSAGE_TOPICS.HOST_CONTROL,
            );

            await new Promise((resolve) => setImmediate(resolve));

            expect(mockRoom.localParticipant.setScreenShareEnabled).not.toHaveBeenCalled();
        });
    });

    describe('screen share', () => {
        // Models LiveKit's behavior: by the time LocalTrackPublished / TrackSubscribed
        // fires, the participant's getTrackPublication already returns the publication.
        function setLocalScreenPublications(video?: {mediaStreamTrack: MediaStreamTrack}, audio?: {mediaStreamTrack: MediaStreamTrack}) {
            mockRoom.localParticipant.getTrackPublication.mockImplementation((source: Track.Source) => {
                if (source === Track.Source.ScreenShare && video) {
                    return {source, track: video};
                }
                if (source === Track.Source.ScreenShareAudio && audio) {
                    return {source, track: audio};
                }
                return null;
            });
        }

        function makeRemoteParticipant(identity: string, video?: {mediaStreamTrack: MediaStreamTrack}, audio?: {mediaStreamTrack: MediaStreamTrack}) {
            return {
                identity,
                getTrackPublication: jest.fn((source: Track.Source) => {
                    if (source === Track.Source.ScreenShare && video) {
                        return {source, track: video};
                    }
                    if (source === Track.Source.ScreenShareAudio && audio) {
                        return {source, track: audio};
                    }
                    return null;
                }),
            };
        }

        // Models createScreenTracks: hands back unpublished tracks, and publishing
        // one makes the participant's getTrackPublication reflect it, as LiveKit does.
        function stubCapture(video: MediaStreamTrack, audio?: MediaStreamTrack) {
            const tracks: any[] = [{mediaStreamTrack: video, source: Track.Source.ScreenShare, stop: jest.fn()}];
            if (audio) {
                tracks.push({mediaStreamTrack: audio, source: Track.Source.ScreenShareAudio, stop: jest.fn()});
            }
            mockRoom.localParticipant.createScreenTracks.mockResolvedValueOnce(tracks);

            let publishedVideo = false;
            let publishedAudio = false;
            mockRoom.localParticipant.publishTrack.mockImplementation((track: any) => {
                if (track.source === Track.Source.ScreenShare) {
                    publishedVideo = true;
                } else if (track.source === Track.Source.ScreenShareAudio) {
                    publishedAudio = true;
                }
                setLocalScreenPublications(
                    publishedVideo ? {mediaStreamTrack: video} : undefined,
                    publishedAudio && audio ? {mediaStreamTrack: audio} : undefined,
                );
                mockRoom.fire(RoomEvent.LocalTrackPublished, {source: track.source, track}, mockRoom.localParticipant);
                return Promise.resolve();
            });
            return tracks;
        }

        it('captures then publishes a screen video track and emits the derived sharer', async () => {
            await client.connect({channelID: 'test-channel'});

            const videoTrack = {} as MediaStreamTrack;
            stubCapture(videoTrack);

            const listener = jest.fn();
            client.on(CALL_EVENT.SCREEN_SHARING_CHANGED, listener);

            const result = await client.shareScreen('', false);

            expect(mockRoom.localParticipant.createScreenTracks).toHaveBeenCalledWith({audio: false});
            expect(listener).toHaveBeenCalledWith(expect.objectContaining({
                sessionID: 'me-session',
                userID: 'me-id',
                isLocal: true,
            }));
            const [stream] = result;
            expect(stream).not.toBeNull();
            expect(stream!.getTracks()).toEqual([videoTrack]);
        });

        it('merges ScreenShareAudio into the same MediaStream as ScreenShare', async () => {
            await client.connect({channelID: 'test-channel'});

            const videoTrack = {} as MediaStreamTrack;
            const audioTrack = {} as MediaStreamTrack;
            stubCapture(videoTrack, audioTrack);

            const result = await client.shareScreen('', true);

            const [stream] = result;
            expect(stream).not.toBeNull();
            expect(stream!.getTracks()).toEqual([videoTrack, audioTrack]);
        });

        it('bails without publishing when someone else starts sharing while the picker is open', async () => {
            await client.connect({channelID: 'test-channel'});

            const captured: any = {mediaStreamTrack: {}, source: Track.Source.ScreenShare, stop: jest.fn()};

            // The competing share appears only once capture resolves, which is the
            // window the pre-capture check cannot see — the user was in the picker.
            mockRoom.localParticipant.createScreenTracks.mockImplementationOnce(() => {
                mockRoom.remoteParticipants.set('p1', makeRemoteParticipant('user1___p1-session', {mediaStreamTrack: {} as MediaStreamTrack}));
                return Promise.resolve([captured]);
            });

            const result = await client.shareScreen('', false);

            expect(result).toEqual([null, 'already-sharing']);
            expect(mockRoom.localParticipant.publishTrack).not.toHaveBeenCalled();

            // The capture is released rather than left running with nobody receiving it.
            expect(captured.stop).toHaveBeenCalled();
        });

        describe('desktop (Electron) source picker', () => {
            beforeEach(() => {
                (window as any).desktop = {version: '5.7.0'};
                (getScreenStream as jest.Mock).mockReset();
                (LocalVideoTrack as unknown as jest.Mock).mockClear();
                (LocalAudioTrack as unknown as jest.Mock).mockClear();
            });

            afterEach(() => {
                delete (window as any).desktop;
            });

            it('captures the chosen sourceID via getScreenStream and publishes it as a ScreenShare track', async () => {
                await client.connect({channelID: 'test-channel'});

                const videoTrack = {} as MediaStreamTrack;
                (getScreenStream as jest.Mock).mockResolvedValue({
                    getVideoTracks: () => [videoTrack],
                    getAudioTracks: () => [],
                });

                // Mirror LiveKit: publishing fires LocalTrackPublished and the participant's
                // getTrackPublication starts reflecting the new screen-share publication.
                mockRoom.localParticipant.publishTrack.mockImplementation((track: any) => {
                    if (track.source === Track.Source.ScreenShare) {
                        setLocalScreenPublications({mediaStreamTrack: videoTrack});
                        mockRoom.fire(
                            RoomEvent.LocalTrackPublished,
                            {source: Track.Source.ScreenShare, track: {mediaStreamTrack: videoTrack}},
                            mockRoom.localParticipant,
                        );
                    }
                    return Promise.resolve();
                });

                const listener = jest.fn();
                client.on(CALL_EVENT.SCREEN_SHARING_CHANGED, listener);

                const result = await client.shareScreen('screen:1:0', false);

                expect(getScreenStream).toHaveBeenCalledWith('screen:1:0', false);
                expect(mockRoom.localParticipant.createScreenTracks).not.toHaveBeenCalled();

                // Published the captured video track, tagged as ScreenShare.
                expect(LocalVideoTrack).toHaveBeenCalledWith(videoTrack, undefined, false);
                const publishedVideo = mockRoom.localParticipant.publishTrack.mock.calls[0][0];
                expect(publishedVideo.source).toBe(Track.Source.ScreenShare);

                expect(listener).toHaveBeenCalledWith(expect.objectContaining({
                    sessionID: 'me-session',
                    isLocal: true,
                }));
                expect(result[0]).not.toBeNull();
            });

            it('also publishes the system-audio track as ScreenShareAudio when withAudio is true', async () => {
                await client.connect({channelID: 'test-channel'});

                const videoTrack = {} as MediaStreamTrack;
                const audioTrack = {} as MediaStreamTrack;
                (getScreenStream as jest.Mock).mockResolvedValue({
                    getVideoTracks: () => [videoTrack],
                    getAudioTracks: () => [audioTrack],
                });

                await client.shareScreen('screen:1:0', true);

                expect(getScreenStream).toHaveBeenCalledWith('screen:1:0', true);
                expect(LocalVideoTrack).toHaveBeenCalledWith(videoTrack, undefined, false);
                expect(LocalAudioTrack).toHaveBeenCalledWith(audioTrack, undefined, false);

                const sources = mockRoom.localParticipant.publishTrack.mock.calls.map((c: any[]) => c[0].source);
                expect(sources).toEqual([Track.Source.ScreenShare, Track.Source.ScreenShareAudio]);
            });

            it('returns capture-error without publishing when getScreenStream yields no stream (user cancelled)', async () => {
                await client.connect({channelID: 'test-channel'});

                (getScreenStream as jest.Mock).mockResolvedValue(null);

                const result = await client.shareScreen('screen:1:0', false);

                expect(result).toEqual([null, 'capture-error']);
                expect(mockRoom.localParticipant.publishTrack).not.toHaveBeenCalled();
            });
        });

        it('wires mediaStreamTrack.onended to drive unshareScreen when the browser bar stops the share', async () => {
            await client.connect({channelID: 'test-channel'});

            const videoTrack: any = {};
            stubCapture(videoTrack);
            await client.shareScreen();

            expect(typeof videoTrack.onended).toBe('function');

            videoTrack.onended();

            // unshareScreen is async and `onended` is a fire-and-forget caller, so
            // flush the microtask queue before asserting.
            await new Promise((resolve) => setImmediate(resolve));

            expect(mockRoom.localParticipant.setScreenShareEnabled).toHaveBeenCalledWith(false);
        });

        it('clears the derived sharer on LocalTrackUnpublished for ScreenShare', async () => {
            await client.connect({channelID: 'test-channel'});

            const videoTrack = {} as MediaStreamTrack;
            stubCapture(videoTrack);
            await client.shareScreen();

            const listener = jest.fn();
            client.on(CALL_EVENT.SCREEN_SHARING_CHANGED, listener);

            // LiveKit clears the publication before firing LocalTrackUnpublished.
            setLocalScreenPublications();
            mockRoom.fire(
                RoomEvent.LocalTrackUnpublished,
                {source: Track.Source.ScreenShare},
                mockRoom.localParticipant,
            );

            expect(listener).toHaveBeenCalledWith(null);
            expect(client.getLocalScreenStream()).toBeNull();
        });

        it('emits the derived sharer when a remote ScreenShare track is subscribed', async () => {
            await client.connect({channelID: 'test-channel'});
            const listener = jest.fn();
            client.on(CALL_EVENT.SCREEN_SHARING_CHANGED, listener);

            const videoTrack = {} as MediaStreamTrack;
            const remoteParticipant = makeRemoteParticipant('user1___p1-session', {mediaStreamTrack: videoTrack});
            mockRoom.remoteParticipants.set('p1', remoteParticipant);

            mockRoom.fire(
                RoomEvent.TrackSubscribed,
                {source: Track.Source.ScreenShare, mediaStreamTrack: videoTrack},
                {},
                remoteParticipant,
            );

            expect(listener).toHaveBeenCalledWith(expect.objectContaining({
                sessionID: 'p1-session',
                userID: 'user1',
                isLocal: false,
            }));
            const emitted = listener.mock.calls[0][0];
            expect(emitted.stream.getTracks()).toEqual([videoTrack]);
        });

        it('merges remote ScreenShareAudio into the same MediaStream as ScreenShare for the same sharer', async () => {
            await client.connect({channelID: 'test-channel'});

            const videoTrack = {} as MediaStreamTrack;
            const audioTrack = {} as MediaStreamTrack;
            const remoteParticipant = makeRemoteParticipant('user1___p1-session', {mediaStreamTrack: videoTrack});
            mockRoom.remoteParticipants.set('p1', remoteParticipant);

            const listener = jest.fn();
            client.on(CALL_EVENT.SCREEN_SHARING_CHANGED, listener);

            mockRoom.fire(
                RoomEvent.TrackSubscribed,
                {source: Track.Source.ScreenShare, mediaStreamTrack: videoTrack},
                {},
                remoteParticipant,
            );

            // Audio joins the participant's publications, then its event fires.
            (remoteParticipant.getTrackPublication as jest.Mock).mockImplementation((source: Track.Source) => {
                if (source === Track.Source.ScreenShare) {
                    return {source, trackSid: 'video-sid', track: {mediaStreamTrack: videoTrack}};
                }
                if (source === Track.Source.ScreenShareAudio) {
                    return {source, trackSid: 'audio-sid', track: {mediaStreamTrack: audioTrack}};
                }
                return null;
            });
            mockRoom.fire(
                RoomEvent.TrackSubscribed,
                {source: Track.Source.ScreenShareAudio, mediaStreamTrack: audioTrack},
                {},
                remoteParticipant,
            );

            const latest = listener.mock.calls.at(-1)?.[0];
            expect(latest.stream.getTracks()).toEqual([videoTrack, audioTrack]);
        });

        it('clears the derived sharer when a remote ScreenShare track is unpublished', async () => {
            await client.connect({channelID: 'test-channel'});

            const remoteParticipant = makeRemoteParticipant('user1___p1-session', {mediaStreamTrack: {} as MediaStreamTrack});
            mockRoom.remoteParticipants.set('p1', remoteParticipant);
            mockRoom.fire(
                RoomEvent.TrackSubscribed,
                {source: Track.Source.ScreenShare, mediaStreamTrack: {}},
                {},
                remoteParticipant,
            );

            const listener = jest.fn();
            client.on(CALL_EVENT.SCREEN_SHARING_CHANGED, listener);

            // LiveKit drops the publication before firing TrackUnpublished.
            (remoteParticipant.getTrackPublication as jest.Mock).mockReturnValue(null);
            mockRoom.fire(
                RoomEvent.TrackUnpublished,
                {source: Track.Source.ScreenShare},
                remoteParticipant,
            );

            expect(listener).toHaveBeenCalledWith(null);
        });

        it('clears the derived sharer when the sharer disconnects, which fires no track event', async () => {
            await client.connect({channelID: 'test-channel'});

            const remoteParticipant = makeRemoteParticipant('user1___p1-session', {mediaStreamTrack: {} as MediaStreamTrack});
            mockRoom.remoteParticipants.set('p1', remoteParticipant);
            mockRoom.fire(
                RoomEvent.TrackSubscribed,
                {source: Track.Source.ScreenShare, mediaStreamTrack: {}},
                {},
                remoteParticipant,
            );

            const listener = jest.fn();
            client.on(CALL_EVENT.SCREEN_SHARING_CHANGED, listener);

            mockRoom.remoteParticipants.delete('p1');
            mockRoom.fire(RoomEvent.ParticipantDisconnected, remoteParticipant);

            expect(listener).toHaveBeenCalledWith(null);
        });

        it('presents the lowest session id when two participants share at once', async () => {
            await client.connect({channelID: 'test-channel'});

            const listener = jest.fn();
            client.on(CALL_EVENT.SCREEN_SHARING_CHANGED, listener);

            // Inserted highest-first so a correct result cannot come from map order.
            const late = makeRemoteParticipant('user2___zzz-session', {mediaStreamTrack: {} as MediaStreamTrack});
            const early = makeRemoteParticipant('user1___aaa-session', {mediaStreamTrack: {} as MediaStreamTrack});
            mockRoom.remoteParticipants.set('p2', late);
            mockRoom.remoteParticipants.set('p1', early);

            mockRoom.fire(
                RoomEvent.TrackSubscribed,
                {source: Track.Source.ScreenShare, mediaStreamTrack: {}},
                {},
                late,
            );

            expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({sessionID: 'aaa-session'}));
        });

        it('does not re-emit when a recompute finds the same sharer and tracks', async () => {
            await client.connect({channelID: 'test-channel'});

            const videoTrack = {} as MediaStreamTrack;
            const remoteParticipant = makeRemoteParticipant('user1___p1-session', {mediaStreamTrack: videoTrack});
            mockRoom.remoteParticipants.set('p1', remoteParticipant);

            const listener = jest.fn();
            client.on(CALL_EVENT.SCREEN_SHARING_CHANGED, listener);

            const subscribe = () => mockRoom.fire(
                RoomEvent.TrackSubscribed,
                {source: Track.Source.ScreenShare, mediaStreamTrack: videoTrack},
                {},
                remoteParticipant,
            );
            subscribe();
            subscribe();

            // A duplicated event must not hand consumers a fresh MediaStream to
            // re-attach, which is what made the video flicker.
            expect(listener).toHaveBeenCalledTimes(1);
        });

        it('getRemoteScreenStream finds the sharer among remoteParticipants', async () => {
            await client.connect({channelID: 'test-channel'});

            const videoTrack = {} as MediaStreamTrack;
            const sharer = makeRemoteParticipant('user1___p1-session', {mediaStreamTrack: videoTrack});
            const nonSharer = makeRemoteParticipant('user2___p2-session');
            mockRoom.remoteParticipants.set('p1', sharer);
            mockRoom.remoteParticipants.set('p2', nonSharer);

            const stream = client.getRemoteScreenStream();
            expect(stream).not.toBeNull();
            expect(stream?.getTracks()).toEqual([videoTrack]);
        });

        it('getRemoteScreenStream returns null when no remote participant is sharing', async () => {
            await client.connect({channelID: 'test-channel'});
            mockRoom.remoteParticipants.set('p1', makeRemoteParticipant('user1___p1-session'));
            expect(client.getRemoteScreenStream()).toBeNull();
        });

        it('unshareScreen calls setScreenShareEnabled(false)', async () => {
            await client.connect({channelID: 'test-channel'});
            await client.unshareScreen();

            expect(mockRoom.localParticipant.setScreenShareEnabled).toHaveBeenCalledWith(false);
        });

        it('unshareScreen returns early when not connected', async () => {
            // No connect() — isRoomConnected stays false.
            await client.unshareScreen();

            expect(mockRoom.localParticipant.setScreenShareEnabled).not.toHaveBeenCalled();
        });

        it('unshareScreen emits ERROR when setScreenShareEnabled rejects', async () => {
            await client.connect({channelID: 'test-channel'});

            mockRoom.localParticipant.setScreenShareEnabled.mockRejectedValueOnce(new Error('unpublish failed'));
            const errorListener = jest.fn();
            client.on(CALL_EVENT.ERROR, errorListener);

            await client.unshareScreen();

            expect(errorListener).toHaveBeenCalledWith(expect.any(Error));
        });

        it('shareScreen returns existing stream without publishing when this client is already sharing', async () => {
            await client.connect({channelID: 'test-channel'});

            const videoTrack = {} as MediaStreamTrack;

            // Simulate that this client already has an active screen share publication.
            setLocalScreenPublications({mediaStreamTrack: videoTrack});

            const result = await client.shareScreen();

            const [stream] = result;
            expect(stream).not.toBeNull();
            expect(stream!.getTracks()).toEqual([videoTrack]);
            expect(mockRoom.localParticipant.createScreenTracks).not.toHaveBeenCalled();
        });

        it('shareScreen passes systemAudio: include only when withAudio is true', async () => {
            await client.connect({channelID: 'test-channel'});

            await client.shareScreen('', true);

            expect(mockRoom.localParticipant.createScreenTracks).toHaveBeenCalledWith({audio: true, systemAudio: 'include'});
        });

        it('shareScreen returns already-sharing error without capturing when a remote participant is already sharing', async () => {
            await client.connect({channelID: 'test-channel'});

            const otherSharer = makeRemoteParticipant('user1___p1-session', {mediaStreamTrack: {} as MediaStreamTrack});
            mockRoom.remoteParticipants.set('p1', otherSharer);

            const result = await client.shareScreen();

            expect(result).toEqual([null, 'already-sharing']);
            expect(mockRoom.localParticipant.createScreenTracks).not.toHaveBeenCalled();
        });

        it('shareScreen returns capture-error and emits ERROR for a non-permission failure', async () => {
            await client.connect({channelID: 'test-channel'});

            // A generic failure (name !== NotAllowedError) is not classified as PermissionDenied,
            // so it still surfaces as a call error.
            mockRoom.localParticipant.createScreenTracks.mockRejectedValueOnce(new Error('publish failed'));
            const errorListener = jest.fn();
            client.on(CALL_EVENT.ERROR, errorListener);

            const result = await client.shareScreen();

            expect(result).toEqual([null, 'capture-error']);
            expect(errorListener).toHaveBeenCalledWith(expect.any(Error));
        });

        it('shareScreen returns permission-denied and does NOT emit ERROR when the picker is cancelled/denied (PermissionDenied)', async () => {
            await client.connect({channelID: 'test-channel'});

            // Dismissing the screen picker rejects getDisplayMedia with NotAllowedError, which
            // LiveKit re-throws from createScreenTracks. MediaDeviceFailure classifies that as
            // PermissionDenied (it reads err.name), so we must NOT raise the global error modal.
            const notAllowed = Object.assign(new Error('Permission denied'), {name: 'NotAllowedError'});
            mockRoom.localParticipant.createScreenTracks.mockRejectedValueOnce(notAllowed);
            const errorListener = jest.fn();
            client.on(CALL_EVENT.ERROR, errorListener);

            const result = await client.shareScreen();

            expect(result).toEqual([null, 'permission-denied']);
            expect(errorListener).not.toHaveBeenCalled();
        });
    });

    describe('shareScreenWithStream', () => {
        beforeEach(() => {
            (LocalVideoTrack as unknown as jest.Mock).mockClear();
            (LocalAudioTrack as unknown as jest.Mock).mockClear();
        });

        it('publishes video track as ScreenShare and returns true', async () => {
            await client.connect({channelID: 'test-channel'});

            const videoTrack = {stop: jest.fn()} as unknown as MediaStreamTrack;
            const stream = {
                getVideoTracks: () => [videoTrack],
                getAudioTracks: () => [],
                getTracks: () => [videoTrack],
                id: 'stream-id',
            } as unknown as MediaStream;

            const ok = await client.shareScreenWithStream(stream);

            expect(ok).toBe(true);
            expect(LocalVideoTrack).toHaveBeenCalledWith(videoTrack, undefined, false);
            const publishedVideo = mockRoom.localParticipant.publishTrack.mock.calls[0][0];
            expect(publishedVideo.source).toBe(Track.Source.ScreenShare);
        });

        it('also publishes audio track as ScreenShareAudio', async () => {
            await client.connect({channelID: 'test-channel'});

            const videoTrack = {stop: jest.fn()} as unknown as MediaStreamTrack;
            const audioTrack = {stop: jest.fn()} as unknown as MediaStreamTrack;
            const stream = {
                getVideoTracks: () => [videoTrack],
                getAudioTracks: () => [audioTrack],
                getTracks: () => [videoTrack, audioTrack],
                id: 'stream-id',
            } as unknown as MediaStream;

            const ok = await client.shareScreenWithStream(stream);

            expect(ok).toBe(true);
            const sources = mockRoom.localParticipant.publishTrack.mock.calls.map((c: any[]) => c[0].source);
            expect(sources).toEqual([Track.Source.ScreenShare, Track.Source.ScreenShareAudio]);
        });

        it('returns false and stops tracks when a remote participant is already sharing', async () => {
            await client.connect({channelID: 'test-channel'});

            mockRoom.remoteParticipants.set('other', {
                getTrackPublication: (source: Track.Source) => source === Track.Source.ScreenShare ? {} : null,
            });

            const stopFn = jest.fn();
            const stream = {
                getVideoTracks: () => [],
                getAudioTracks: () => [],
                getTracks: () => [{stop: stopFn}],
            } as unknown as MediaStream;

            const ok = await client.shareScreenWithStream(stream);

            expect(ok).toBe(false);
            expect(stopFn).toHaveBeenCalled();
            expect(mockRoom.localParticipant.publishTrack).not.toHaveBeenCalled();

            mockRoom.remoteParticipants.clear();
        });

        it('returns false, unpublishes any partial tracks, and stops on publishTrack error', async () => {
            await client.connect({channelID: 'test-channel'});

            const videoTrack = {} as MediaStreamTrack;
            const stopFn = jest.fn();
            const stream = {
                getVideoTracks: () => [videoTrack],
                getAudioTracks: () => [],
                getTracks: () => [{stop: stopFn}],
            } as unknown as MediaStream;

            mockRoom.localParticipant.publishTrack.mockRejectedValueOnce(new Error('publish failed'));
            mockRoom.localParticipant.unpublishTrack = jest.fn().mockResolvedValue(undefined);

            const errorListener = jest.fn();
            client.on(CALL_EVENT.ERROR, errorListener);

            const ok = await client.shareScreenWithStream(stream);

            expect(ok).toBe(false);
            expect(stopFn).toHaveBeenCalled();
            expect(errorListener).toHaveBeenCalledWith(expect.any(Error));
        });
    });

    describe('mute / unmute', () => {
        it('unmute calls pub.unmute() on the existing mic publication', async () => {
            await client.connect({channelID: 'test-channel'});

            const mockPub = {mute: jest.fn().mockResolvedValue(undefined), unmute: jest.fn().mockResolvedValue(undefined)};
            mockRoom.localParticipant.getTrackPublication.mockReturnValueOnce(mockPub);

            await client.unmute();

            expect(mockPub.unmute).toHaveBeenCalledTimes(1);
        });

        it('mute calls pub.mute() on the existing mic publication', async () => {
            await client.connect({channelID: 'test-channel'});

            const mockPub = {mute: jest.fn().mockResolvedValue(undefined), unmute: jest.fn().mockResolvedValue(undefined)};
            mockRoom.localParticipant.getTrackPublication.mockReturnValueOnce(mockPub);

            await client.mute();

            expect(mockPub.mute).toHaveBeenCalledTimes(1);
        });

        it('unmute is a no-op when no mic track is published', async () => {
            await client.connect({channelID: 'test-channel'});

            // getTrackPublication returns undefined by default — no track published yet.
            const errorListener = jest.fn();
            client.on(CALL_EVENT.ERROR, errorListener);

            await expect(client.unmute()).resolves.toBeUndefined();

            expect(errorListener).not.toHaveBeenCalled();
        });

        it('mute/unmute do not emit ERROR when pub throws', async () => {
            await client.connect({channelID: 'test-channel'});

            const mockPub = {
                mute: jest.fn().mockRejectedValue(new Error('device in use')),
                unmute: jest.fn().mockRejectedValue(new Error('device in use')),
            };
            mockRoom.localParticipant.getTrackPublication.mockReturnValue(mockPub);

            const errorListener = jest.fn();
            client.on(CALL_EVENT.ERROR, errorListener);

            await expect(client.mute()).resolves.toBeUndefined();
            await expect(client.unmute()).resolves.toBeUndefined();

            expect(errorListener).not.toHaveBeenCalled();
        });
    });

    describe('SDK error logging', () => {
        it('logs an error when a remote track subscription fails', () => {
            const storage = getPersistentStorage();
            storage.removeItem(STORAGE_CALLS_CLIENT_LOGS_KEY);

            mockRoom.fire(RoomEvent.TrackSubscriptionFailed, 'TR_abc', {identity: 'user1___sess1'}, undefined);

            flushLogsToAccumulated();
            const logs = storage.getItem(STORAGE_CALLS_CLIENT_LOGS_KEY) || '';
            expect(logs).toContain('track subscription failed for track TR_abc');
            expect(logs).toContain('user1');
        });

        it('logs an error on an encryption error', () => {
            const storage = getPersistentStorage();
            storage.removeItem(STORAGE_CALLS_CLIENT_LOGS_KEY);

            mockRoom.fire(RoomEvent.EncryptionError, new Error('boom'));

            flushLogsToAccumulated();
            expect(storage.getItem(STORAGE_CALLS_CLIENT_LOGS_KEY) || '').toContain('encryption error');
        });
    });

    describe('getStats', () => {
        // makeTrack builds a minimal stand-in for a LiveKit Local/RemoteTrack:
        // the fields trackMetadata() reads plus a getRTCStatsReport() returning
        // the given W3C stats map.
        const makeTrack = (opts: {
            sid: string;
            source: string;
            mstId: string;
            kind: string;
            streamID?: string;
            label?: string;
            enabled?: boolean;
            readyState?: string;
            report?: Map<string, any> | undefined;
            reportErr?: Error;
        }) => ({
            sid: opts.sid,
            source: opts.source,
            kind: opts.kind,
            mediaStream: opts.streamID ? {id: opts.streamID} : undefined,
            mediaStreamTrack: {
                id: opts.mstId,
                kind: opts.kind,
                label: opts.label ?? '',
                enabled: opts.enabled ?? true,
                readyState: opts.readyState ?? 'live',
            },
            getRTCStatsReport: opts.reportErr ? jest.fn().mockRejectedValue(opts.reportErr) : jest.fn().mockResolvedValue(opts.report),
        });

        const setPublications = (local: any[], remote: any[]) => {
            mockRoom.localParticipant.trackPublications = new Map(
                local.map((track, i) => [`local-pub-${i}`, {track}]),
            );
            mockRoom.remoteParticipants = new Map([
                ['remote-1', {
                    trackPublications: new Map(
                        remote.map((track, i) => [`remote-pub-${i}`, {track}]),
                    ),
                }],
            ]);
        };

        it('returns null when there is no room', async () => {
            (client as any).room = null;

            expect(await client.getStats()).toBeNull();
        });

        it('reports track metadata and parsed rtc stats from local and remote tracks', async () => {
            client.initTime = 1234;
            client.channelID = 'channel-abc';

            const localReport = new Map<string, any>([
                ['out-1', {id: 'out-1', type: 'outbound-rtp', ssrc: 111, kind: 'audio', bytesSent: 500}],
                ['cp-1', {id: 'cp-1', type: 'candidate-pair', state: 'succeeded', nominated: true, priority: 10, localCandidateId: 'lc-1', remoteCandidateId: 'rc-1'}],
                ['lc-1', {id: 'lc-1', type: 'local-candidate', candidateType: 'host'}],
                ['rc-1', {id: 'rc-1', type: 'remote-candidate', candidateType: 'srflx'}],
            ]);
            const remoteReport = new Map<string, any>([
                ['in-1', {id: 'in-1', type: 'inbound-rtp', ssrc: 222, kind: 'audio', bytesReceived: 700}],
            ]);

            const micTrack = makeTrack({sid: 'mic-sid', source: 'microphone', kind: 'audio', mstId: 'mic-mst', streamID: 'mic-stream', label: 'Default Mic', report: localReport});
            const remoteTrack = makeTrack({sid: 'rem-sid', source: 'microphone', kind: 'audio', mstId: 'rem-mst', streamID: 'rem-stream', report: remoteReport});
            setPublications([micTrack], [remoteTrack]);

            const stats = await client.getStats();

            expect(stats).not.toBeNull();
            expect(stats!.initTime).toBe(1234);
            expect(stats!.channelID).toBe('channel-abc');

            expect(stats!.tracksInfo).toEqual([
                {streamID: 'mic-stream', id: 'mic-mst', kind: 'audio', label: 'Default Mic', enabled: true, readyState: 'live'},
                {streamID: 'rem-stream', id: 'rem-mst', kind: 'audio', label: '', enabled: true, readyState: 'live'},
            ]);

            // SSRC stats from both reports are merged.
            expect(stats!.rtcStats!.ssrcStats[111].local.out).toMatchObject({bytesSent: 500, kind: 'audio'});
            expect(stats!.rtcStats!.ssrcStats[222].local.in).toMatchObject({bytesReceived: 700, kind: 'audio'});

            // ICE candidate-pair was parsed and its local/remote candidates resolved.
            expect(stats!.rtcStats!.iceStats.succeeded).toHaveLength(1);
            expect(stats!.rtcStats!.iceStats.succeeded[0]).toMatchObject({
                id: 'cp-1',
                nominated: true,
                local: {id: 'lc-1', candidateType: 'host'},
                remote: {id: 'rc-1', candidateType: 'srflx'},
            });
        });

        it('falls back to empty streamID when a track has no mediaStream', async () => {
            const track = makeTrack({sid: 's', source: 'microphone', kind: 'audio', mstId: 'm', report: new Map()});
            setPublications([track], []);

            const stats = await client.getStats();

            expect(stats!.tracksInfo[0].streamID).toBe('');
        });

        it('skips publications without a track', async () => {
            mockRoom.localParticipant.trackPublications = new Map([['pub-0', {track: undefined}]]);
            mockRoom.remoteParticipants = new Map();

            const stats = await client.getStats();

            expect(stats!.tracksInfo).toEqual([]);
            expect(stats!.rtcStats).toBeNull();
        });

        it('continues when a track fails to produce a stats report', async () => {
            const goodReport = new Map<string, any>([
                ['out-1', {id: 'out-1', type: 'outbound-rtp', ssrc: 111, kind: 'audio', bytesSent: 1}],
            ]);
            const good = makeTrack({sid: 'good', source: 'microphone', kind: 'audio', mstId: 'good-mst', report: goodReport});
            const bad = makeTrack({sid: 'bad', source: 'screen_share', kind: 'video', mstId: 'bad-mst', reportErr: new Error('peer gone')});
            setPublications([good, bad], []);

            const stats = await client.getStats();

            // Both tracks are still described; only the good report contributes stats.
            expect(stats!.tracksInfo).toHaveLength(2);
            expect(stats!.rtcStats!.ssrcStats[111].local.out).toMatchObject({bytesSent: 1});
        });

        it('returns null rtcStats when no track yields a report', async () => {
            const track = makeTrack({sid: 's', source: 'microphone', kind: 'audio', mstId: 'm', report: undefined});
            setPublications([track], []);

            const stats = await client.getStats();

            expect(stats!.tracksInfo).toHaveLength(1);
            expect(stats!.rtcStats).toBeNull();
        });
    });
});
