// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {ConnectionQuality, Room, RoomEvent, Track} from 'livekit-client';
import RestClient from 'src/clients/rest';
import {WebSocketClient} from 'src/clients/websocket';
import {WEBSOCKET_EVENT} from 'src/clients/websocket/constants';
import {
    STORAGE_CALLS_DEFAULT_AUDIO_INPUT_KEY,
    STORAGE_CALLS_DEFAULT_AUDIO_OUTPUT_KEY,
} from 'src/constants';

import CallClient from './call_client';
import {CALL_EVENT} from './constants';

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

jest.mock('src/clients/websocket', () => {
    const actual = jest.requireActual('src/clients/websocket');
    return {
        ...actual,
        WebSocketClient: jest.fn(),
    };
});

// Mock factory for a Room instance — captures every `room.on(event, handler)`
// call so tests can fire events back through the registered handler.
type RoomEventHandler = (...args: any[]) => void;

type MockRoom = {
    on: jest.Mock;
    connect: jest.Mock;
    disconnect: jest.Mock;
    switchActiveDevice: jest.Mock;
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
        switchActiveDevice: jest.fn().mockResolvedValue(null),
        localParticipant: {
            sid: 'me-sid',
            identity: 'me-id___me-session',
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

type WebSocketEventHandler = (...args: any[]) => void;

type MockWebSocketClient = {
    on: jest.Mock;
    connect: jest.Mock;
    ready: jest.Mock;
    sendJoin: jest.Mock;
    sendReconnect: jest.Mock;
    sendLeave: jest.Mock;
    close: jest.Mock;
    getOriginalConnID: jest.Mock;
    fire: (event: string, ...args: any[]) => void;
};

function createMockWebSocketClient(): MockWebSocketClient {
    const handlers = new Map<string, WebSocketEventHandler>();
    const websocketClient: MockWebSocketClient = {
        on: jest.fn((event: string, handler: WebSocketEventHandler) => {
            handlers.set(event, handler);
            return websocketClient;
        }),
        connect: jest.fn(),
        ready: jest.fn().mockResolvedValue('orig-conn-id'),
        sendJoin: jest.fn(),
        sendReconnect: jest.fn(),
        sendLeave: jest.fn(),
        close: jest.fn(),
        getOriginalConnID: jest.fn().mockReturnValue('orig-conn-id'),
        fire: (event: string, ...args: any[]) => {
            const handler = handlers.get(event);
            if (!handler) {
                throw new Error(`No handler registered for websocket event: ${event}`);
            }
            handler(...args);
        },
    };
    return websocketClient;
}

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

    (global as any).MediaStream = jest.fn().mockImplementation((tracks) => ({tracks}));
});

beforeEach(() => {
    window.localStorage.clear();
    (navigator.mediaDevices.enumerateDevices as jest.Mock).mockResolvedValue([]);
});

describe('CallClient', () => {
    let client: CallClient;
    let mockRoom: MockRoom;
    let mockWebSocketClient: MockWebSocketClient;

    beforeEach(() => {
        mockRoom = createMockRoom();
        mockWebSocketClient = createMockWebSocketClient();
        (Room as unknown as jest.Mock).mockImplementation(() => mockRoom);
        (WebSocketClient as unknown as jest.Mock).mockImplementation(() => mockWebSocketClient);
        (RestClient.fetch as jest.Mock).mockResolvedValue({
            token: 'fake-token',
            url: 'wss://fake.url',
        });

        client = new CallClient({websocketURL: 'wss://fake.ws'});
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('initial state', () => {
        it('initializes fields to defaults', () => {
            expect(client.channelID).toBe('');
            expect(client.initTime).toBe(0);
            expect(client.room).toBe(mockRoom);
            expect(Room).toHaveBeenCalledTimes(1);
            expect(WebSocketClient).toHaveBeenCalledWith('wss://fake.ws');
        });
    });

    describe('connect', () => {
        it('fetches a token (with channel_id + session_id) and calls room.connect', async () => {
            await client.connect({channelID: 'test-channel'});

            const fetchURL = (RestClient.fetch as jest.Mock).mock.calls[0][0];
            expect(fetchURL).toContain('channel_id=test-channel');
            expect(fetchURL).toContain('session_id=orig-conn-id');
            expect(RestClient.fetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({method: 'GET'}),
            );
            expect(mockWebSocketClient.connect).toHaveBeenCalled();
            expect(mockRoom.connect).toHaveBeenCalledWith('wss://fake.url', 'fake-token');
        });

        it('reuses the stored connect payload when the websocket opens', async () => {
            const payload = {channelID: 'test-channel', title: 'Test Call', threadID: 'thread-id'};
            const connectPromise = client.connect(payload);

            mockWebSocketClient.fire(WEBSOCKET_EVENT.OPEN, 'orig-conn-id', '', false);
            await connectPromise;

            expect(mockWebSocketClient.sendJoin).toHaveBeenCalledWith(payload);
        });

        it('throws if a room is already connected', async () => {
            await client.connect({channelID: 'test-channel'});
            await expect(client.connect({channelID: 'test-channel'})).rejects.toThrow('already connected');
        });

        it('throws and emits ERROR if token fetch returns empty values', async () => {
            (RestClient.fetch as jest.Mock).mockResolvedValueOnce({token: '', url: ''});
            const errorListener = jest.fn();
            client.on(CALL_EVENT.ERROR, errorListener);

            await expect(client.connect({channelID: 'test-channel'})).rejects.toThrow('token or url');
        });

        it('emits ERROR when room.connect rejects', async () => {
            mockRoom.connect.mockRejectedValueOnce(new Error('network down'));
            const errorListener = jest.fn();
            client.on(CALL_EVENT.ERROR, errorListener);

            await expect(client.connect({channelID: 'test-channel'})).rejects.toThrow('network down');
            expect(errorListener).toHaveBeenCalledWith(expect.any(Error));
            expect(client.room).toBeNull();
        });
    });

    describe('Connected event', () => {
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
                {sid: 'p1-sid', identity: 'user1___p1-session'},
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

            expect(client.getAudioDevices()).toEqual({
                inputs: [inputDevice, inputDevice2],
                outputs: [outputDevice],
            });
        });

        it('setAudioInputDevice persists, switches the LiveKit device, and emits DEVICE_CHANGE', async () => {
            await client.connect({channelID: 'test-channel'});
            const deviceChangeListener = jest.fn();
            client.on(CALL_EVENT.DEVICE_CHANGE, deviceChangeListener);

            await client.setAudioInputDevice(inputDevice);

            expect(mockRoom.switchActiveDevice).toHaveBeenCalledWith('audioinput', 'mic-1');
            expect(client.currentAudioInputDevice).toBe(inputDevice);
            expect(window.localStorage.getItem(STORAGE_CALLS_DEFAULT_AUDIO_INPUT_KEY))
                .toBe(JSON.stringify({deviceId: 'mic-1', label: 'Built-in Mic'}));
            expect(deviceChangeListener).toHaveBeenCalled();
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

            expect(client.currentAudioInputDevice).toBe(inputDevice2);
            expect(client.currentAudioOutputDevice).toBe(outputDevice);
            expect(mockRoom.switchActiveDevice).toHaveBeenCalledWith('audioinput', 'mic-2');
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
});
