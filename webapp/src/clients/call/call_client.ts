// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {EmojiData} from '@mattermost/calls-common/lib/types';
import {EventEmitter} from 'events';
import {ConnectionState, DisconnectReason, LocalTrackPublication, RemoteParticipant, RemoteTrack, RemoteTrackPublication, Room, RoomEvent, Track} from 'livekit-client';
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

    // Stub props — real values land in follow-up PRs (audio/video/screen).
    public audioTrack: MediaStreamTrack | null = null;
    public localVideoStream: MediaStream | null = null;
    public currentAudioInputDevice: MediaDeviceInfo | null = null;
    public currentAudioOutputDevice: MediaDeviceInfo | null = null;
    public currentVideoInputDevice: MediaDeviceInfo | null = null;

    private closed = false;

    private handleConnected() {
        this.initTime = Date.now();

        // Request microphone permission in the background so connection
        // handling is not blocked by the user's interaction.
        void this.requestMicrophonePermission();

        this.emit(CALL_EVENT.CONNECTED);
        logInfo('call client: connected to room');
    }

    private async requestMicrophonePermission() {
        try {
            // Request microphone permission upfront, then immediately mute.
            await this.room?.localParticipant.setMicrophoneEnabled(true);
            await this.room?.localParticipant.setMicrophoneEnabled(false);
            this.emit(CALL_EVENT.MUTE);
        } catch (err) {
            logErr('call client: failed to request microphone permission', err);
            this.emit(CALL_EVENT.ERROR, err);
        }
    }

    private handleConnectionStateChanged(state: ConnectionState) {
        logDebug('call client: connection state changed', state);
    }

    private handleReconnecting() {
        logInfo('call client: reconnecting to room');
        this.emit(CALL_EVENT.RECONNECTING);
    }

    private handleReconnected() {
        logInfo('call client: reconnected to room');
        this.emit(CALL_EVENT.RECONNECTED);
    }

    private handleDisconnected(reason?: DisconnectReason) {
        logInfo('call client: disconnected from room', reason);
        this.emit(CALL_EVENT.DISCONNECTED, reason);
    }

    private handleTrackSubscribed(
        track: RemoteTrack,
        _pub: RemoteTrackPublication,
        participant: RemoteParticipant,
    ) {
        if (track.source === Track.Source.Microphone) {
            const stream = new MediaStream([track.mediaStreamTrack]);
            logInfo(`call client: subscribed to remote voice from ${participant.identity}`);
            this.emit(CALL_EVENT.REMOTE_VOICE_STREAM, stream, participant.identity);
        }
    }

    private handleLocalTrackPublished(publication: LocalTrackPublication) {
        logInfo('call client: local track published', publication);

        if (publication.source === Track.Source.Microphone) {
            this.audioTrack = publication.track?.mediaStreamTrack ?? null;
        }
    }

    /** From here on down the methods are all PUBLIC, and are the entry points for the CallClient */

    public async connect(channelID: string): Promise<void> {
        if (this.room) {
            throw new Error('call client: room already connected');
        }

        this.channelID = channelID;

        const response = await fetchRtcToken(channelID);
        const token = response?.token ?? '';
        const url = response?.url ?? '';
        if (!token || !url) {
            throw new Error('call client: either token or url were not received from token API');
        }

        logInfo(`call client: trying to connect to ${url} for channel ${channelID} with valid token`);

        const room = new Room();
        this.room = room;

        room.on(RoomEvent.Connected, this.handleConnected.bind(this));
        room.on(RoomEvent.ConnectionStateChanged, this.handleConnectionStateChanged.bind(this));
        room.on(RoomEvent.Reconnecting, this.handleReconnecting.bind(this));
        room.on(RoomEvent.Reconnected, this.handleReconnected.bind(this));
        room.on(RoomEvent.Disconnected, this.handleDisconnected.bind(this));
        room.on(RoomEvent.TrackSubscribed, this.handleTrackSubscribed.bind(this));
        room.on(RoomEvent.LocalTrackPublished, this.handleLocalTrackPublished.bind(this));

        try {
            await room.connect(url, token);
        } catch (err) {
            logErr(`call client: failed to connect to room ${url}`, err);
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
                logErr('call client: error during disconnect', disconnectErr);
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
        this.emit(CALL_EVENT.MUTE);
    }

    public async unmute(): Promise<void> {
        if (!this.room) {
            return;
        }
        await this.room.localParticipant.setMicrophoneEnabled(true);
        this.emit(CALL_EVENT.UNMUTE);
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
        return [];
    }

    public async getStats(): Promise<CallsClientStats | null> {
        return null;
    }
}
