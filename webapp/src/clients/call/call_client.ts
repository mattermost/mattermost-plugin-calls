// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {EmojiData} from '@mattermost/calls-common/lib/types';
import {EventEmitter} from 'events';
import {
    ConnectionState,
    DisconnectReason,
    LocalParticipant,
    LocalTrackPublication,
    Participant,
    RemoteParticipant,
    RemoteTrack,
    RemoteTrackPublication,
    Room,
    RoomEvent,
    Track,
    TrackPublication,
} from 'livekit-client';
import RestClient from 'src/clients/rest';
import {CALL_EVENT, CALL_TOKEN_API_PATH} from 'src/constants';
import {logDebug, logErr, logInfo} from 'src/log';
import {CallsClientStats, MediaDevices} from 'src/types/types';
import {getPluginPath} from 'src/utils';

export type RtcTokenResponse = {
    token: string;
    url: string;
};

export async function fetchRtcToken(channelID: string): Promise<RtcTokenResponse> {
    const url = `${getPluginPath()}/${CALL_TOKEN_API_PATH}?channel_id=${encodeURIComponent(channelID)}`;
    return RestClient.fetch<RtcTokenResponse>(url, {method: 'GET'});
}

export default class CallClient extends EventEmitter {
    public channelID = '';
    public initTime = 0;
    public room: Room | null = null;

    public audioTrack: MediaStreamTrack | null = null;
    public localVideoStream: MediaStream | null = null;
    public currentAudioInputDevice: MediaDeviceInfo | null = null;
    public currentAudioOutputDevice: MediaDeviceInfo | null = null;
    public currentVideoInputDevice: MediaDeviceInfo | null = null;

    private closed = false;

    private handleConnected() {
        if (!this.room) {
            return;
        }

        this.initTime = Date.now();

        // Request microphone permission in the background so connection
        // handling is not blocked by the user's interaction.
        void this.requestMicrophonePermission();

        // Seed the initial state for everyone already in the room (local + remote).
        const localParticipant = this.room.localParticipant;
        this.emit(CALL_EVENT.USER_JOINED, localParticipant.sid, localParticipant.identity, true);

        const isLocalMicMuted = localParticipant.getTrackPublication(Track.Source.Microphone)?.isMuted ?? true;
        this.emit(isLocalMicMuted ? CALL_EVENT.MUTE : CALL_EVENT.UNMUTE, localParticipant.sid, localParticipant.identity);

        for (const remoteParticipant of this.room.remoteParticipants.values()) {
            this.emit(CALL_EVENT.USER_JOINED, remoteParticipant.sid, remoteParticipant.identity, true);

            const isRemoteMicMuted = remoteParticipant.getTrackPublication(Track.Source.Microphone)?.isMuted ?? true;
            this.emit(isRemoteMicMuted ? CALL_EVENT.MUTE : CALL_EVENT.UNMUTE, remoteParticipant.sid, remoteParticipant.identity);
        }

        this.emit(CALL_EVENT.CONNECTED);
        logInfo('CallClient: connected to room');
    }

    private async requestMicrophonePermission() {
        try {
            // Just request permission to the microphone and
            // stop the track immediately to avoid any audio being published
            const mediaStream = await navigator.mediaDevices.getUserMedia({audio: true});
            mediaStream.getTracks().forEach((mediaStreamTrack) => {
                mediaStreamTrack.stop();
            });

            logInfo('CallClient: microphone permission granted');
        } catch (err) {
            logErr('CallClient: failed to request microphone permission', err);
            this.emit(CALL_EVENT.ERROR, err);
        }
    }

    private handleConnectionStateChanged(state: ConnectionState) {
        logDebug('CallClient: connection state changed', state);
    }

    private handleReconnecting() {
        logInfo('CallClient: reconnecting to room');

        this.emit(CALL_EVENT.RECONNECTING);
    }

    private handleReconnected() {
        logInfo('CallClient: reconnected to room');

        this.emit(CALL_EVENT.RECONNECTED);
    }

    private handleDisconnected(reason?: DisconnectReason) {
        logInfo('CallClient: disconnected from room', reason);

        this.emit(CALL_EVENT.DISCONNECTED, reason);
    }

    /**
     * Fires when a remote participant's audio bits start flowing to us.
     * We wrap the track in a MediaStream and ship it to the widget for `<audio>` playback.
     */
    private handleTrackSubscribed(track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) {
        if (track.source === Track.Source.Microphone) {
            const stream = new MediaStream([track.mediaStreamTrack]);
            this.emit(CALL_EVENT.REMOTE_VOICE_STREAM, stream, participant.sid);

            logInfo(`CallClient: subscribed to remote track from ${participant.identity}`);
        }
    }

    /**
     * Fires when our own mic track is created and published (e.g., user's first unmute).
     * Captures the underlying MediaStreamTrack and emits the initial mute/unmute state.
     */
    private handleLocalTrackPublished(localTrackPublication: LocalTrackPublication, localParticipant: LocalParticipant) {
        if (localTrackPublication.source === Track.Source.Microphone) {
            this.emit(localTrackPublication.isMuted ? CALL_EVENT.MUTE : CALL_EVENT.UNMUTE, localParticipant.sid, localParticipant.identity);
            this.audioTrack = localTrackPublication.track?.mediaStreamTrack ?? null;

            logInfo(`CallClient: local track published from ${localParticipant.identity}`, localTrackPublication);
        }
    }

    /**
     * Fires when our own mic track is fully torn down (disconnect, explicit unpublish).
     * Clears the audioTrack reference and emits MUTE since "no publication" means muted in our UI.
     */
    private handleLocalTrackUnpublished(localTrackPublication: LocalTrackPublication, localParticipant: LocalParticipant) {
        if (localTrackPublication.source === Track.Source.Microphone) {
            this.emit(CALL_EVENT.MUTE, localParticipant.sid, localParticipant.identity);
            this.audioTrack = null;

            logInfo(`CallClient: local track unpublished from ${localParticipant.identity}`, localTrackPublication);
        }
    }

    /**
     * Fires when a remote participant publishes a mic track (e.g., they unmute for the first time).
     * Emits the initial mute/unmute state for that participant based on `pub.isMuted`.
     */
    private handleTrackPublished(remoteTrackPublication: RemoteTrackPublication, remoteParticipant: RemoteParticipant) {
        if (remoteTrackPublication.source === Track.Source.Microphone) {
            this.emit(remoteTrackPublication.isMuted ? CALL_EVENT.MUTE : CALL_EVENT.UNMUTE, remoteParticipant.sid, remoteParticipant.identity);

            logInfo(`CallClient: remote track published from ${remoteParticipant.identity}`, remoteTrackPublication);
        }
    }

    /**
     * Fires when a remote participant tears down their mic track (rare; usually only on leave).
     * Treats "no publication" as muted and emits MUTE for that participant.
     */
    private handleTrackUnpublished(remoteTrackPublication: RemoteTrackPublication, remoteParticipant: RemoteParticipant) {
        if (remoteTrackPublication.source === Track.Source.Microphone) {
            this.emit(CALL_EVENT.MUTE, remoteParticipant.sid, remoteParticipant.identity);

            logInfo(`CallClient: remote track unpublished from ${remoteParticipant.identity}`, remoteTrackPublication);
        }
    }

    /**
     * Fires when any participant (local or remote) mutes an existing mic publication.
     * Emits MUTE keyed by that participant's sid + identity.
     */
    private handleTrackMuted(trackPublication: TrackPublication, participant: Participant) {
        if (trackPublication.source === Track.Source.Microphone) {
            this.emit(CALL_EVENT.MUTE, participant.sid, participant.identity);

            logInfo(`CallClient: track muted from ${participant.identity}`, trackPublication);
        }
    }

    /**
     * Fires when any participant (local or remote) unmutes an existing mic publication.
     * Emits UNMUTE keyed by that participant's sid + identity.
     */
    private handleTrackUnmuted(trackPublication: TrackPublication, participant: Participant) {
        if (trackPublication.source === Track.Source.Microphone) {
            this.emit(CALL_EVENT.UNMUTE, participant.sid, participant.identity);

            logInfo(`CallClient: track unmuted from ${participant.identity}`, trackPublication);
        }
    }

    /**
     * Fires when a remote participant joins the room (after we have already connected).
     * Emits USER_JOINED so the dispatcher can populate Redux + play the join sound.
     */
    private handleParticipantConnected(remoteParticipant: RemoteParticipant) {
        this.emit(CALL_EVENT.USER_JOINED, remoteParticipant.sid, remoteParticipant.identity);

        logInfo(`CallClient: participant connected ${remoteParticipant.identity}`);
    }

    /**
     * Fires when a remote participant leaves the room.
     * Emits USER_LEFT so the dispatcher can drop the session from Redux.
     */
    private handleParticipantDisconnected(remoteParticipant: RemoteParticipant) {
        this.emit(CALL_EVENT.USER_LEFT, remoteParticipant.sid, remoteParticipant.identity);

        logInfo(`CallClient: participant disconnected ${remoteParticipant.identity}`);
    }

    private handleMediaDevicesError(err: Error) {
        logErr('CallClient: media device error', err);
        this.emit(CALL_EVENT.ERROR, err);
    }

    /** From here on down the methods are all PUBLIC, and are the entry points for the CallClient */

    public async connect(channelID: string): Promise<void> {
        if (this.room) {
            throw new Error('CallClient: room already connected');
        }

        this.channelID = channelID;

        const response = await fetchRtcToken(channelID);
        const token = response?.token ?? '';
        const url = response?.url ?? '';
        if (!token || !url) {
            throw new Error('CallClient: either token or url were not received from token API');
        }

        logInfo(`CallClient: trying to connect to ${url} for channel ${channelID} with valid token`);

        const room = new Room();
        this.room = room;

        room.on(RoomEvent.Connected, this.handleConnected.bind(this));
        room.on(RoomEvent.ConnectionStateChanged, this.handleConnectionStateChanged.bind(this));
        room.on(RoomEvent.Reconnecting, this.handleReconnecting.bind(this));
        room.on(RoomEvent.Reconnected, this.handleReconnected.bind(this));
        room.on(RoomEvent.Disconnected, this.handleDisconnected.bind(this));
        room.on(RoomEvent.TrackSubscribed, this.handleTrackSubscribed.bind(this));
        room.on(RoomEvent.TrackPublished, this.handleTrackPublished.bind(this));
        room.on(RoomEvent.TrackUnpublished, this.handleTrackUnpublished.bind(this));
        room.on(RoomEvent.LocalTrackPublished, this.handleLocalTrackPublished.bind(this));
        room.on(RoomEvent.LocalTrackUnpublished, this.handleLocalTrackUnpublished.bind(this));
        room.on(RoomEvent.TrackMuted, this.handleTrackMuted.bind(this));
        room.on(RoomEvent.TrackUnmuted, this.handleTrackUnmuted.bind(this));
        room.on(RoomEvent.ParticipantConnected, this.handleParticipantConnected.bind(this));
        room.on(RoomEvent.ParticipantDisconnected, this.handleParticipantDisconnected.bind(this));
        room.on(RoomEvent.MediaDevicesError, this.handleMediaDevicesError.bind(this));

        try {
            await room.connect(url, token);
        } catch (err) {
            logErr(`CallClient: failed to connect to room ${url}`, err);
            this.room = null;
            this.emit(CALL_EVENT.ERROR, err);
            throw err;
        }
    }

    public async disconnect(err?: Error): Promise<void> {
        if (this.closed) {
            return;
        }
        this.closed = true;

        if (err) {
            this.emit(CALL_EVENT.ERROR, err);
        }

        if (this.room) {
            try {
                await this.room.disconnect();
            } catch (disconnectErr) {
                logErr('CallClient: error during disconnect', disconnectErr);
            } finally {
                this.room = null;
            }
        }
    }

    public destroy() {
        this.disconnect();
    }

    public getSessionID(): string {
        return this.room?.localParticipant?.sid ?? '';
    }

    public async mute(): Promise<void> {
        if (!this.room) {
            return;
        }
        await this.room.localParticipant.setMicrophoneEnabled(false);
    }

    public async unmute(): Promise<void> {
        if (!this.room) {
            return;
        }
        await this.room.localParticipant.setMicrophoneEnabled(true);
    }

    public async startVideo(): Promise<MediaStream | null> {
        throw new Error('CallClient.startVideo: not yet implemented');
    }

    public stopVideo(): void {
        throw new Error('CallClient.stopVideo: not yet implemented');
    }

    public async setVideoInputDevice(_device: MediaDeviceInfo): Promise<void> {
        throw new Error('CallClient.setVideoInputDevice: not yet implemented');
    }

    public getVideoDevices(): MediaDeviceInfo[] {
        return [];
    }

    public getRemoteVideoStream(): MediaStream | null {
        return null;
    }

    public raiseHand(): void {
        throw new Error('CallClient.raiseHand: not yet implemented');
    }

    public unraiseHand(): void {
        throw new Error('CallClient.unraiseHand: not yet implemented');
    }

    public async shareScreen(_sourceID?: string, _withAudio?: boolean): Promise<MediaStream | null> {
        throw new Error('CallClient.shareScreen: not yet implemented');
    }

    public unshareScreen(): void {
        throw new Error('CallClient.unshareScreen: not yet implemented');
    }

    public async setScreenStream(_stream: MediaStream): Promise<void> {
        throw new Error('CallClient.setScreenStream: not yet implemented');
    }

    public async setBlurSettings(_blurEnabled: boolean, _blurIntensity: number): Promise<void> {
        throw new Error('CallClient.setBlurSettings: not yet implemented');
    }

    public async setAudioInputDevice(_device: MediaDeviceInfo, _store: boolean = true): Promise<void> {
        throw new Error('CallClient.setAudioInputDevice: not yet implemented');
    }

    public async setAudioOutputDevice(_device: MediaDeviceInfo, _store: boolean = true): Promise<void> {
        throw new Error('CallClient.setAudioOutputDevice: not yet implemented');
    }

    public sendUserReaction(_data: EmojiData): void {
        throw new Error('CallClient.sendUserReaction: not yet implemented');
    }

    // Getters return safe defaults rather than throwing — they're called from
    // component lifecycle (componentDidMount), not user gestures, so they
    // must always be safe to invoke regardless of feature implementation state.
    public getAudioDevices(): MediaDevices {
        return {inputs: [], outputs: []};
    }

    public getLocalScreenStream(): MediaStream | null {
        return null;
    }

    public getRemoteScreenStream(): MediaStream | null {
        return null;
    }

    public getRemoteVoiceTracks(): MediaStreamTrack[] {
        if (!this.room) {
            return [];
        }

        const remoteVoiceTracks: MediaStreamTrack[] = [];
        for (const remoteParticipant of this.room.remoteParticipants.values()) {
            for (const audioTrackPublicationOfRemoteParticipant of remoteParticipant.audioTrackPublications.values()) {
                if (audioTrackPublicationOfRemoteParticipant.source !== Track.Source.Microphone || !audioTrackPublicationOfRemoteParticipant.isSubscribed) {
                    continue;
                }

                if (audioTrackPublicationOfRemoteParticipant.track?.mediaStreamTrack?.readyState === 'live') {
                    remoteVoiceTracks.push(audioTrackPublicationOfRemoteParticipant.track.mediaStreamTrack);
                }
            }
        }
        return remoteVoiceTracks;
    }

    public async getStats(): Promise<CallsClientStats | null> {
        return null;
    }
}
