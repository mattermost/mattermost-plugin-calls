// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Track} from 'livekit-client';
import {CALL_EVENT} from 'src/constants';

import CallClient from './call_client';

describe('CallClient', () => {
    let client: CallClient;

    beforeEach(() => {
        client = new CallClient();

        // Stub out emit so we can assert calls without actually firing handlers.
        client.emit = jest.fn();
    });

    describe('initial state', () => {
        it('initializes fields to defaults', () => {
            expect(client.channelID).toBe('');
            expect(client.initTime).toBe(0);
            expect(client.room).toBeNull();
            expect(client.audioTrack).toBeNull();
        });
    });

    describe('getSessionID', () => {
        it('returns empty string when no room', () => {
            expect(client.getSessionID()).toBe('');
        });

        it('returns localParticipant.sid when room is set', () => {
            (client as any).room = {localParticipant: {sid: 'session-123'}};
            expect(client.getSessionID()).toBe('session-123');
        });
    });

    describe('mute / unmute', () => {
        it('mute is a no-op when no room', async () => {
            await client.mute();
            expect(client.emit).not.toHaveBeenCalled();
        });

        it('unmute is a no-op when no room', async () => {
            await client.unmute();
            expect(client.emit).not.toHaveBeenCalled();
        });

        it('mute() calls setMicrophoneEnabled(false) on local participant', async () => {
            const setMicrophoneEnabled = jest.fn().mockResolvedValue(undefined);
            (client as any).room = {localParticipant: {setMicrophoneEnabled}};

            await client.mute();

            expect(setMicrophoneEnabled).toHaveBeenCalledWith(false);
        });

        it('unmute() calls setMicrophoneEnabled(true) on local participant', async () => {
            const setMicrophoneEnabled = jest.fn().mockResolvedValue(undefined);
            (client as any).room = {localParticipant: {setMicrophoneEnabled}};

            await client.unmute();

            expect(setMicrophoneEnabled).toHaveBeenCalledWith(true);
        });

        it('mute() does not emit CALL_EVENT.MUTE itself (handler-driven)', async () => {
            const setMicrophoneEnabled = jest.fn().mockResolvedValue(undefined);
            (client as any).room = {localParticipant: {setMicrophoneEnabled}};

            await client.mute();

            expect(client.emit).not.toHaveBeenCalled();
        });
    });

    describe('handleTrackMuted', () => {
        it('emits MUTE with (sid, identity) for mic source', () => {
            const pub = {source: Track.Source.Microphone};
            const participant = {sid: 'p1', identity: 'user1'};

            (client as any).handleTrackMuted(pub, participant);

            expect(client.emit).toHaveBeenCalledWith(CALL_EVENT.MUTE, 'p1', 'user1');
        });

        it('ignores non-microphone tracks', () => {
            const pub = {source: Track.Source.ScreenShare};
            const participant = {sid: 'p1', identity: 'user1'};

            (client as any).handleTrackMuted(pub, participant);

            expect(client.emit).not.toHaveBeenCalled();
        });
    });

    describe('handleTrackUnmuted', () => {
        it('emits UNMUTE with (sid, identity) for mic source', () => {
            const pub = {source: Track.Source.Microphone};
            const participant = {sid: 'p1', identity: 'user1'};

            (client as any).handleTrackUnmuted(pub, participant);

            expect(client.emit).toHaveBeenCalledWith(CALL_EVENT.UNMUTE, 'p1', 'user1');
        });

        it('ignores non-microphone tracks', () => {
            const pub = {source: Track.Source.ScreenShareAudio};
            const participant = {sid: 'p1', identity: 'user1'};

            (client as any).handleTrackUnmuted(pub, participant);

            expect(client.emit).not.toHaveBeenCalled();
        });
    });

    describe('handleTrackSubscribed', () => {
        let originalMediaStream: typeof MediaStream;

        beforeAll(() => {
            originalMediaStream = global.MediaStream;
            (global as any).MediaStream = jest.fn().mockImplementation((tracks) => ({tracks}));
        });

        afterAll(() => {
            (global as any).MediaStream = originalMediaStream;
        });

        it('emits REMOTE_VOICE_STREAM with stream and participant.sid for mic', () => {
            const mediaStreamTrack = {} as MediaStreamTrack;
            const track = {source: Track.Source.Microphone, mediaStreamTrack};
            const participant = {sid: 'p1', identity: 'user1'};

            (client as any).handleTrackSubscribed(track, {}, participant);

            expect(client.emit).toHaveBeenCalledWith(
                CALL_EVENT.REMOTE_VOICE_STREAM,
                expect.anything(),
                'p1',
            );
        });

        it('ignores non-microphone tracks', () => {
            const track = {source: Track.Source.ScreenShare, mediaStreamTrack: {}};
            const participant = {sid: 'p1', identity: 'user1'};

            (client as any).handleTrackSubscribed(track, {}, participant);

            expect(client.emit).not.toHaveBeenCalled();
        });
    });

    describe('handleTrackPublished (remote)', () => {
        it('emits MUTE for muted publication', () => {
            const pub = {source: Track.Source.Microphone, isMuted: true};
            const participant = {sid: 'p1', identity: 'user1'};

            (client as any).handleTrackPublished(pub, participant);

            expect(client.emit).toHaveBeenCalledWith(CALL_EVENT.MUTE, 'p1', 'user1');
        });

        it('emits UNMUTE for unmuted publication', () => {
            const pub = {source: Track.Source.Microphone, isMuted: false};
            const participant = {sid: 'p1', identity: 'user1'};

            (client as any).handleTrackPublished(pub, participant);

            expect(client.emit).toHaveBeenCalledWith(CALL_EVENT.UNMUTE, 'p1', 'user1');
        });

        it('ignores non-microphone tracks', () => {
            const pub = {source: Track.Source.Camera, isMuted: false};
            (client as any).handleTrackPublished(pub, {sid: 'p1', identity: 'u1'});
            expect(client.emit).not.toHaveBeenCalled();
        });
    });

    describe('handleTrackUnpublished (remote)', () => {
        it('emits MUTE (no track = muted) for mic', () => {
            const pub = {source: Track.Source.Microphone};
            const participant = {sid: 'p1', identity: 'user1'};

            (client as any).handleTrackUnpublished(pub, participant);

            expect(client.emit).toHaveBeenCalledWith(CALL_EVENT.MUTE, 'p1', 'user1');
        });
    });

    describe('handleLocalTrackPublished', () => {
        it('captures audioTrack and emits UNMUTE for unmuted mic publication', () => {
            const mediaStreamTrack = {} as MediaStreamTrack;
            const pub = {
                source: Track.Source.Microphone,
                isMuted: false,
                track: {mediaStreamTrack},
            };
            const localParticipant = {sid: 'me', identity: 'me-id'};

            (client as any).handleLocalTrackPublished(pub, localParticipant);

            expect(client.audioTrack).toBe(mediaStreamTrack);
            expect(client.emit).toHaveBeenCalledWith(CALL_EVENT.UNMUTE, 'me', 'me-id');
        });

        it('emits MUTE for muted mic publication', () => {
            const pub = {
                source: Track.Source.Microphone,
                isMuted: true,
                track: {mediaStreamTrack: {} as MediaStreamTrack},
            };
            const localParticipant = {sid: 'me', identity: 'me-id'};

            (client as any).handleLocalTrackPublished(pub, localParticipant);

            expect(client.emit).toHaveBeenCalledWith(CALL_EVENT.MUTE, 'me', 'me-id');
        });

        it('ignores non-mic tracks and does not touch audioTrack', () => {
            const pub = {source: Track.Source.ScreenShare};
            (client as any).handleLocalTrackPublished(pub, {sid: 'me', identity: 'me-id'});

            expect(client.audioTrack).toBeNull();
            expect(client.emit).not.toHaveBeenCalled();
        });
    });

    describe('handleLocalTrackUnpublished', () => {
        it('clears audioTrack and emits MUTE for mic', () => {
            client.audioTrack = {} as MediaStreamTrack;
            const pub = {source: Track.Source.Microphone};
            const localParticipant = {sid: 'me', identity: 'me-id'};

            (client as any).handleLocalTrackUnpublished(pub, localParticipant);

            expect(client.audioTrack).toBeNull();
            expect(client.emit).toHaveBeenCalledWith(CALL_EVENT.MUTE, 'me', 'me-id');
        });

        it('ignores non-mic tracks', () => {
            const original = {} as MediaStreamTrack;
            client.audioTrack = original;
            const pub = {source: Track.Source.ScreenShare};

            (client as any).handleLocalTrackUnpublished(pub, {sid: 'me', identity: 'me-id'});

            expect(client.audioTrack).toBe(original);
            expect(client.emit).not.toHaveBeenCalled();
        });
    });

    describe('handleParticipantConnected', () => {
        it('emits USER_JOINED for the remote participant (no isFromInitialSync)', () => {
            const participant = {sid: 'p1', identity: 'user1'};

            (client as any).handleParticipantConnected(participant);

            expect(client.emit).toHaveBeenCalledWith(CALL_EVENT.USER_JOINED, 'p1', 'user1');
        });
    });

    describe('handleParticipantDisconnected', () => {
        it('emits USER_LEFT for the remote participant', () => {
            const participant = {sid: 'p1', identity: 'user1'};

            (client as any).handleParticipantDisconnected(participant);

            expect(client.emit).toHaveBeenCalledWith(CALL_EVENT.USER_LEFT, 'p1', 'user1');
        });
    });

    describe('handleMediaDevicesError', () => {
        it('emits CALL_EVENT.ERROR with the error', () => {
            const err = new Error('device gone');

            (client as any).handleMediaDevicesError(err);

            expect(client.emit).toHaveBeenCalledWith(CALL_EVENT.ERROR, err);
        });
    });

    describe('handleConnected', () => {
        const setupRoom = (
            localMicPub: any,
            remoteParts: Array<{sid: string; identity: string; micPub: any}>,
        ) => {
            (client as any).room = {
                localParticipant: {
                    sid: 'me',
                    identity: 'me-id',
                    getTrackPublication: jest.fn(() => localMicPub),
                },
                remoteParticipants: new Map(
                    remoteParts.map((p) => [
                        p.sid,
                        {
                            sid: p.sid,
                            identity: p.identity,
                            getTrackPublication: jest.fn(() => p.micPub),
                        },
                    ]),
                ),
            };
            // Don't actually request mic permission in tests.
            (client as any).requestMicrophonePermission = jest.fn().mockResolvedValue(undefined);
        };

        it('is a no-op when room is null', () => {
            (client as any).handleConnected();
            expect(client.emit).not.toHaveBeenCalled();
        });

        it('emits USER_JOINED before MUTE/UNMUTE for self (regression: review #1)', () => {
            setupRoom({isMuted: false}, []);

            (client as any).handleConnected();

            const calls = (client.emit as jest.Mock).mock.calls;
            const joinedIdx = calls.findIndex(
                (c) => c[0] === CALL_EVENT.USER_JOINED && c[1] === 'me',
            );
            const muteIdx = calls.findIndex(
                (c) => (c[0] === CALL_EVENT.UNMUTE || c[0] === CALL_EVENT.MUTE) && c[1] === 'me',
            );

            expect(joinedIdx).toBeGreaterThanOrEqual(0);
            expect(muteIdx).toBeGreaterThanOrEqual(0);
            expect(joinedIdx).toBeLessThan(muteIdx);
        });

        it('seeds USER_JOINED for self with isFromInitialSync=true', () => {
            setupRoom({isMuted: false}, []);

            (client as any).handleConnected();

            expect(client.emit).toHaveBeenCalledWith(
                CALL_EVENT.USER_JOINED,
                'me',
                'me-id',
                true,
            );
        });

        it('treats absent mic publication as muted', () => {
            setupRoom(undefined, []);

            (client as any).handleConnected();

            expect(client.emit).toHaveBeenCalledWith(CALL_EVENT.MUTE, 'me', 'me-id');
        });

        it('seeds USER_JOINED + MUTE/UNMUTE for each remote participant', () => {
            setupRoom({isMuted: false}, [
                {sid: 'r1', identity: 'remote-1', micPub: {isMuted: true}},
                {sid: 'r2', identity: 'remote-2', micPub: {isMuted: false}},
            ]);

            (client as any).handleConnected();

            expect(client.emit).toHaveBeenCalledWith(
                CALL_EVENT.USER_JOINED,
                'r1',
                'remote-1',
                true,
            );
            expect(client.emit).toHaveBeenCalledWith(CALL_EVENT.MUTE, 'r1', 'remote-1');
            expect(client.emit).toHaveBeenCalledWith(
                CALL_EVENT.USER_JOINED,
                'r2',
                'remote-2',
                true,
            );
            expect(client.emit).toHaveBeenCalledWith(CALL_EVENT.UNMUTE, 'r2', 'remote-2');
        });

        it('emits CALL_EVENT.CONNECTED last', () => {
            setupRoom({isMuted: false}, []);

            (client as any).handleConnected();

            const calls = (client.emit as jest.Mock).mock.calls;
            expect(calls[calls.length - 1][0]).toBe(CALL_EVENT.CONNECTED);
        });
    });

    describe('handleReconnecting / handleReconnected / handleDisconnected', () => {
        it('handleReconnecting emits RECONNECTING', () => {
            (client as any).handleReconnecting();
            expect(client.emit).toHaveBeenCalledWith(CALL_EVENT.RECONNECTING);
        });

        it('handleReconnected emits RECONNECTED', () => {
            (client as any).handleReconnected();
            expect(client.emit).toHaveBeenCalledWith(CALL_EVENT.RECONNECTED);
        });

        it('handleDisconnected emits DISCONNECTED with reason', () => {
            (client as any).handleDisconnected('SERVER_SHUTDOWN');
            expect(client.emit).toHaveBeenCalledWith(CALL_EVENT.DISCONNECTED, 'SERVER_SHUTDOWN');
        });
    });

    describe('getRemoteVoiceTracks', () => {
        it('returns empty array when no room', () => {
            expect(client.getRemoteVoiceTracks()).toEqual([]);
        });

        it('returns live mic tracks from remote participants', () => {
            const liveTrack = {readyState: 'live'} as MediaStreamTrack;

            (client as any).room = {
                remoteParticipants: new Map([
                    [
                        'p1',
                        {
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
                        },
                    ],
                ]),
            };

            expect(client.getRemoteVoiceTracks()).toEqual([liveTrack]);
        });

        it('skips ended tracks', () => {
            const endedTrack = {readyState: 'ended'} as MediaStreamTrack;

            (client as any).room = {
                remoteParticipants: new Map([
                    [
                        'p1',
                        {
                            audioTrackPublications: new Map([
                                [
                                    't1',
                                    {
                                        source: Track.Source.Microphone,
                                        isSubscribed: true,
                                        track: {mediaStreamTrack: endedTrack},
                                    },
                                ],
                            ]),
                        },
                    ],
                ]),
            };

            expect(client.getRemoteVoiceTracks()).toEqual([]);
        });

        it('skips unsubscribed publications', () => {
            const liveTrack = {readyState: 'live'} as MediaStreamTrack;

            (client as any).room = {
                remoteParticipants: new Map([
                    [
                        'p1',
                        {
                            audioTrackPublications: new Map([
                                [
                                    't1',
                                    {
                                        source: Track.Source.Microphone,
                                        isSubscribed: false,
                                        track: {mediaStreamTrack: liveTrack},
                                    },
                                ],
                            ]),
                        },
                    ],
                ]),
            };

            expect(client.getRemoteVoiceTracks()).toEqual([]);
        });

        it('skips non-microphone publications', () => {
            const liveTrack = {readyState: 'live'} as MediaStreamTrack;

            (client as any).room = {
                remoteParticipants: new Map([
                    [
                        'p1',
                        {
                            audioTrackPublications: new Map([
                                [
                                    't1',
                                    {
                                        source: Track.Source.ScreenShareAudio,
                                        isSubscribed: true,
                                        track: {mediaStreamTrack: liveTrack},
                                    },
                                ],
                            ]),
                        },
                    ],
                ]),
            };

            expect(client.getRemoteVoiceTracks()).toEqual([]);
        });
    });

    describe('safe-default getters', () => {
        it('getAudioDevices returns empty inputs/outputs', () => {
            expect(client.getAudioDevices()).toEqual({inputs: [], outputs: []});
        });

        it('getRemoteVideoStream returns null', () => {
            expect(client.getRemoteVideoStream()).toBeNull();
        });

        it('getRemoteScreenStream returns null', () => {
            expect(client.getRemoteScreenStream()).toBeNull();
        });

        it('getLocalScreenStream returns null', () => {
            expect(client.getLocalScreenStream()).toBeNull();
        });

        it('getVideoDevices returns empty array', () => {
            expect(client.getVideoDevices()).toEqual([]);
        });

        it('getStats resolves to null', async () => {
            await expect(client.getStats()).resolves.toBeNull();
        });
    });

    describe('stub action methods throw "not yet implemented"', () => {
        it('startVideo rejects', async () => {
            await expect(client.startVideo()).rejects.toThrow('not yet implemented');
        });

        it('shareScreen rejects', async () => {
            await expect(client.shareScreen()).rejects.toThrow('not yet implemented');
        });

        it('raiseHand throws', () => {
            expect(() => client.raiseHand()).toThrow('not yet implemented');
        });

        it('setAudioInputDevice rejects', async () => {
            await expect(client.setAudioInputDevice({} as MediaDeviceInfo)).rejects.toThrow(
                'not yet implemented',
            );
        });
    });
});
