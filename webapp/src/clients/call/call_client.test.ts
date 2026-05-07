// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Room, RoomEvent, Track} from 'livekit-client';
import RestClient from 'src/clients/rest';
import {CALL_EVENT} from 'src/constants';

import CallClient from './call_client';

jest.mock('livekit-client', () => {
    const actual = jest.requireActual('livekit-client');
    return {
        ...actual,
        Room: jest.fn(),
    };
});

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
    connect: jest.Mock;
    disconnect: jest.Mock;
    localParticipant: any;
    remoteParticipants: Map<string, any>;
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
        disconnect: jest.fn().mockResolvedValue(null),
        localParticipant: {
            sid: 'me-sid',
            identity: 'me-id',
            getTrackPublication: jest.fn(),
            setMicrophoneEnabled: jest.fn().mockResolvedValue(null),
            audioTrackPublications: new Map(),
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

beforeAll(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
        value: {
            getUserMedia: jest.fn().mockResolvedValue({
                getTracks: () => [],
            }),
        },
        configurable: true,
        writable: true,
    });

    (global as any).MediaStream = jest.fn().mockImplementation((tracks) => ({tracks}));
});

describe('CallClient', () => {
    let client: CallClient;
    let mockRoom: MockRoom;

    beforeEach(() => {
        mockRoom = createMockRoom();
        (Room as unknown as jest.Mock).mockImplementation(() => mockRoom);
        (RestClient.fetch as jest.Mock).mockResolvedValue({
            token: 'fake-token',
            url: 'wss://fake.url',
        });

        client = new CallClient();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('initial state', () => {
        it('initializes fields to defaults', () => {
            expect(client.channelID).toBe('');
            expect(client.initTime).toBe(0);
            expect(client.room).toBeNull();
            expect(client.audioTrack).toBeNull();
        });
    });

    describe('connect', () => {
        it('fetches a token, instantiates Room, and calls room.connect', async () => {
            await client.connect('test-channel');

            expect(RestClient.fetch).toHaveBeenCalledWith(
                expect.stringContaining('test-channel'),
                expect.objectContaining({method: 'GET'}),
            );
            expect(Room).toHaveBeenCalled();
            expect(mockRoom.connect).toHaveBeenCalledWith('wss://fake.url', 'fake-token');
        });

        it('throws if a room is already connected', async () => {
            await client.connect('test-channel');
            await expect(client.connect('test-channel')).rejects.toThrow('already connected');
        });

        it('throws and emits ERROR if token fetch returns empty values', async () => {
            (RestClient.fetch as jest.Mock).mockResolvedValueOnce({token: '', url: ''});
            const errorListener = jest.fn();
            client.on(CALL_EVENT.ERROR, errorListener);

            await expect(client.connect('test-channel')).rejects.toThrow('token or url');
        });

        it('emits ERROR when room.connect rejects', async () => {
            mockRoom.connect.mockRejectedValueOnce(new Error('network down'));
            const errorListener = jest.fn();
            client.on(CALL_EVENT.ERROR, errorListener);

            await expect(client.connect('test-channel')).rejects.toThrow('network down');
            expect(errorListener).toHaveBeenCalledWith(expect.any(Error));
            expect(client.room).toBeNull();
        });
    });

    describe('Connected event', () => {
        it('treats absent mic publication as muted', async () => {
            mockRoom.localParticipant.getTrackPublication.mockReturnValue(null);
            const muteListener = jest.fn();
            client.on(CALL_EVENT.MUTE, muteListener);

            await client.connect('test-channel');
            mockRoom.fire(RoomEvent.Connected);

            expect(muteListener).toHaveBeenCalledWith('me-sid', 'me-id');
        });

        it('seeds USER_JOINED + MUTE for each remote participant in the room', async () => {
            mockRoom.localParticipant.getTrackPublication.mockReturnValue({isMuted: false});
            mockRoom.remoteParticipants.set('r1', {
                sid: 'r1',
                identity: 'remote-1',
                getTrackPublication: jest.fn(() => ({isMuted: true})),
            });
            mockRoom.remoteParticipants.set('r2', {
                sid: 'r2',
                identity: 'remote-2',
                getTrackPublication: jest.fn(() => ({isMuted: false})),
            });

            const userJoinedListener = jest.fn();
            const muteListener = jest.fn();
            const unmuteListener = jest.fn();
            client.on(CALL_EVENT.USER_JOINED, userJoinedListener);
            client.on(CALL_EVENT.MUTE, muteListener);
            client.on(CALL_EVENT.UNMUTE, unmuteListener);

            await client.connect('test-channel');
            mockRoom.fire(RoomEvent.Connected);

            expect(userJoinedListener).toHaveBeenCalledWith('r1', 'remote-1', true);
            expect(muteListener).toHaveBeenCalledWith('r1', 'remote-1');
            expect(userJoinedListener).toHaveBeenCalledWith('r2', 'remote-2', true);
            expect(unmuteListener).toHaveBeenCalledWith('r2', 'remote-2');
        });
    });

    describe('TrackMuted / TrackUnmuted', () => {
        it('emits MUTE with (sid, identity) when mic track is muted', async () => {
            await client.connect('test-channel');
            const muteListener = jest.fn();
            client.on(CALL_EVENT.MUTE, muteListener);

            mockRoom.fire(
                RoomEvent.TrackMuted,
                {source: Track.Source.Microphone},
                {sid: 'p1', identity: 'user1'},
            );

            expect(muteListener).toHaveBeenCalledWith('p1', 'user1');
        });

        it('emits UNMUTE with (sid, identity) when mic track is unmuted', async () => {
            await client.connect('test-channel');
            const unmuteListener = jest.fn();
            client.on(CALL_EVENT.UNMUTE, unmuteListener);

            mockRoom.fire(
                RoomEvent.TrackUnmuted,
                {source: Track.Source.Microphone},
                {sid: 'p1', identity: 'user1'},
            );

            expect(unmuteListener).toHaveBeenCalledWith('p1', 'user1');
        });

        it('does not emit when a non-microphone track is muted', async () => {
            await client.connect('test-channel');
            const muteListener = jest.fn();
            client.on(CALL_EVENT.MUTE, muteListener);

            mockRoom.fire(
                RoomEvent.TrackMuted,
                {source: Track.Source.ScreenShare},
                {sid: 'p1', identity: 'user1'},
            );

            expect(muteListener).not.toHaveBeenCalled();
        });
    });

    describe('TrackPublished / TrackUnpublished (remote)', () => {
        it('emits MUTE for a freshly-published muted mic publication', async () => {
            await client.connect('test-channel');
            const muteListener = jest.fn();
            client.on(CALL_EVENT.MUTE, muteListener);

            mockRoom.fire(
                RoomEvent.TrackPublished,
                {source: Track.Source.Microphone, isMuted: true},
                {sid: 'p1', identity: 'user1'},
            );

            expect(muteListener).toHaveBeenCalledWith('p1', 'user1');
        });

        it('emits UNMUTE for a freshly-published unmuted mic publication (covers first-unmute)', async () => {
            await client.connect('test-channel');
            const unmuteListener = jest.fn();
            client.on(CALL_EVENT.UNMUTE, unmuteListener);

            mockRoom.fire(
                RoomEvent.TrackPublished,
                {source: Track.Source.Microphone, isMuted: false},
                {sid: 'p1', identity: 'user1'},
            );

            expect(unmuteListener).toHaveBeenCalledWith('p1', 'user1');
        });

        it('emits MUTE when a remote unpublishes (no track == muted)', async () => {
            await client.connect('test-channel');
            const muteListener = jest.fn();
            client.on(CALL_EVENT.MUTE, muteListener);

            mockRoom.fire(
                RoomEvent.TrackUnpublished,
                {source: Track.Source.Microphone},
                {sid: 'p1', identity: 'user1'},
            );

            expect(muteListener).toHaveBeenCalledWith('p1', 'user1');
        });
    });

    describe('LocalTrackPublished / LocalTrackUnpublished', () => {
        it('captures audioTrack and emits UNMUTE when local mic is published unmuted', async () => {
            await client.connect('test-channel');
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

            expect(client.audioTrack).toBe(mediaStreamTrack);
            expect(unmuteListener).toHaveBeenCalledWith('me-sid', 'me-id');
        });

        it('clears audioTrack and emits MUTE on local unpublish', async () => {
            await client.connect('test-channel');
            client.audioTrack = {} as MediaStreamTrack;
            const muteListener = jest.fn();
            client.on(CALL_EVENT.MUTE, muteListener);

            mockRoom.fire(
                RoomEvent.LocalTrackUnpublished,
                {source: Track.Source.Microphone},
                mockRoom.localParticipant,
            );

            expect(client.audioTrack).toBeNull();
            expect(muteListener).toHaveBeenCalledWith('me-sid', 'me-id');
        });

        it('does nothing for non-microphone local tracks', async () => {
            await client.connect('test-channel');
            const muteListener = jest.fn();
            const unmuteListener = jest.fn();
            client.on(CALL_EVENT.MUTE, muteListener);
            client.on(CALL_EVENT.UNMUTE, unmuteListener);

            mockRoom.fire(
                RoomEvent.LocalTrackPublished,
                {source: Track.Source.ScreenShare},
                mockRoom.localParticipant,
            );

            expect(client.audioTrack).toBeNull();
            expect(muteListener).not.toHaveBeenCalled();
            expect(unmuteListener).not.toHaveBeenCalled();
        });
    });

    describe('TrackSubscribed (remote audio routing)', () => {
        it('emits REMOTE_VOICE_STREAM with stream + participant.sid for mic source', async () => {
            await client.connect('test-channel');
            const remoteVoiceListener = jest.fn();
            client.on(CALL_EVENT.REMOTE_VOICE_STREAM, remoteVoiceListener);

            mockRoom.fire(
                RoomEvent.TrackSubscribed,
                {source: Track.Source.Microphone, mediaStreamTrack: {}},
                {},
                {sid: 'p1', identity: 'user1'},
            );

            expect(remoteVoiceListener).toHaveBeenCalledWith(expect.anything(), 'p1');
        });

        it('does not emit for non-microphone tracks', async () => {
            await client.connect('test-channel');
            const remoteVoiceListener = jest.fn();
            client.on(CALL_EVENT.REMOTE_VOICE_STREAM, remoteVoiceListener);

            mockRoom.fire(
                RoomEvent.TrackSubscribed,
                {source: Track.Source.ScreenShare, mediaStreamTrack: {}},
                {},
                {sid: 'p1', identity: 'user1'},
            );

            expect(remoteVoiceListener).not.toHaveBeenCalled();
        });
    });

    describe('ParticipantConnected / ParticipantDisconnected', () => {
        it('emits USER_JOINED (no isFromInitialSync) for live remote join', async () => {
            await client.connect('test-channel');
            const userJoinedListener = jest.fn();
            client.on(CALL_EVENT.USER_JOINED, userJoinedListener);

            mockRoom.fire(RoomEvent.ParticipantConnected, {sid: 'p1', identity: 'user1'});

            expect(userJoinedListener).toHaveBeenCalledWith('p1', 'user1');
        });

        it('emits USER_LEFT when a remote participant disconnects', async () => {
            await client.connect('test-channel');
            const userLeftListener = jest.fn();
            client.on(CALL_EVENT.USER_LEFT, userLeftListener);

            mockRoom.fire(RoomEvent.ParticipantDisconnected, {sid: 'p1', identity: 'user1'});

            expect(userLeftListener).toHaveBeenCalledWith('p1', 'user1');
        });
    });

    describe('MediaDevicesError', () => {
        it('emits ERROR with the underlying error', async () => {
            await client.connect('test-channel');
            const errorListener = jest.fn();
            client.on(CALL_EVENT.ERROR, errorListener);

            const err = new Error('mic unplugged');
            mockRoom.fire(RoomEvent.MediaDevicesError, err);

            expect(errorListener).toHaveBeenCalledWith(err);
        });
    });

    describe('getRemoteVoiceTracks', () => {
        it('returns empty array when no room', () => {
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

            await client.connect('test-channel');

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

            await client.connect('test-channel');

            expect(client.getRemoteVoiceTracks()).toEqual([]);
        });
    });
});
