// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/* eslint-disable max-lines */

import type {EmojiData} from '@mattermost/calls-common/lib/types';
import {ClientConfig} from '@mattermost/types/config';
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
import {AudioInputPermissionsError} from 'src/clients/calls';
import RestClient from 'src/clients/rest';
import {WebSocketClient, WebSocketError, WebSocketErrorType} from 'src/clients/websocket';
import {WEBSOCKET_EVENT} from 'src/clients/websocket/constants';
import {
    STORAGE_CALLS_DEFAULT_AUDIO_INPUT_KEY,
    STORAGE_CALLS_DEFAULT_AUDIO_OUTPUT_KEY,
} from 'src/constants';
import {logDebug, logErr} from 'src/log';
import {CallsClientStats, MediaDevices} from 'src/types/types';
import {getPluginPath} from 'src/utils';

import {CALL_EVENT, CALL_TOKEN_API_PATH, USER_ID_SESSION_ID_SEPARATOR} from './constants';
import {ConnectPayload, RtcTokenResponse} from './types';

export default class CallClient extends EventEmitter {
    private readonly websocketURL: string;
    private websocketClient: WebSocketClient | null = null;

    public room: Room | null;

    public channelID = '';
    public initTime = 0;

    public currentAudioInputDevice: MediaDeviceInfo | null = null;
    public currentAudioOutputDevice: MediaDeviceInfo | null = null;

    private isDisconnected = false;
    private isRoomConnected = false;

    private connectPayload: ConnectPayload | null = null;

    // Cached enumerated audio devices so the synchronous getAudioDevices() called
    // from componentDidMount stays cheap and never throws.
    private audioDevices: MediaDevices = {inputs: [], outputs: []};

    constructor({websocketURL}: {websocketURL: ClientConfig['WebsocketURL']}) {
        super();

        this.websocketURL = websocketURL;

        const websocketClient = new WebSocketClient(this.websocketURL);
        this.websocketClient = websocketClient;
        websocketClient.on(WEBSOCKET_EVENT.OPEN, this.handleWebsocketOpened.bind(this));
        websocketClient.on(WEBSOCKET_EVENT.JOIN, this.handleWebsocketJoined.bind(this));
        websocketClient.on(WEBSOCKET_EVENT.MESSAGE, this.handleWebsocketMessageReceived.bind(this));
        websocketClient.on(WEBSOCKET_EVENT.ERROR, this.handleWebsocketErrored.bind(this));
        websocketClient.on(WEBSOCKET_EVENT.CLOSE, this.handleWebsocketClosed.bind(this));

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
        room.on(RoomEvent.ActiveSpeakersChanged, this.handleActiveSpeakersChanged.bind(this));
        room.on(RoomEvent.MediaDevicesChanged, this.handleMediaDevicesChanged.bind(this));
    }

    public async connect(connectPayload: ConnectPayload): Promise<void> {
        if (this.isRoomConnected) {
            throw new Error('CallClient: room already connected');
        }

        if (!this.room) {
            throw new Error('CallClient: room not initialized');
        }

        if (!this.websocketClient) {
            throw new Error('CallClient: pluginWS not initialized');
        }

        this.connectPayload = connectPayload;
        this.channelID = connectPayload.channelID;

        let connectionId: string;
        try {
            this.websocketClient.connect();

            // We obtain the connection ID from the pluginWS so we can use it to fetch the JWT token and URL.
            // this would be the same sessionID which would also be embedded in the identity of the participant.
            connectionId = await this.websocketClient.ready();

            logDebug('CallClient: pluginWS ready with connection_id', connectionId);
        } catch (err) {
            logErr('CallClient: pluginWS connection error', err);
            this.connectPayload = null;

            this.emit(CALL_EVENT.ERROR, err);
            throw err;
        }

        let token: string;
        let url: string;
        try {
            const response = await this.fetchJwtTokenAndUrl(connectPayload.channelID, connectionId);
            token = response.token;
            url = response.url;

            if (!token || !url) {
                throw new Error('CallClient: either token or url were not received from token API');
            }

            logDebug('CallClient: token fetched from token API', url);
        } catch (err) {
            logErr('CallClient: token fetch error', err);
            this.connectPayload = null;

            this.emit(CALL_EVENT.ERROR, err);
            throw err;
        }

        try {
            await this.room.connect(url, token);
            this.isRoomConnected = true;

            logDebug('CallClient: room connected');
        } catch (err) {
            logErr('CallClient: room connection error', err);
            this.isRoomConnected = false;
            this.connectPayload = null;
            this.room = null;

            this.emit(CALL_EVENT.ERROR, err);
            throw err;
        }

        // Hydrate the device cache + restore the user's last selection.
        await this.restoreAudioDevicesFromStorage();
    }

    public async disconnect(err?: Error): Promise<void> {
        if (this.isDisconnected) {
            logErr('CallClient: already disconnected');
            return;
        }

        this.isDisconnected = true;
        this.isRoomConnected = false;
        this.connectPayload = null;

        if (err) {
            this.emit(CALL_EVENT.ERROR, err);
        }

        if (this.room) {
            try {
                await this.room.disconnect();
            } catch (disconnectErr) {
                logErr('CallClient: room disconnect error', disconnectErr);
            } finally {
                this.room = null;
            }
        }

        if (this.websocketClient) {
            // Tell the server we're leaving — server then broadcasts user_left
            // and (if we were the last participant) call_ended.
            try {
                this.websocketClient.sendLeave();
                this.websocketClient.close();
            } catch (wsErr) {
                logErr('CallClient: pluginWS teardown error', wsErr);
            } finally {
                this.websocketClient = null;
            }
        }
    }

    public async mute(): Promise<void> {
        if (!this.room || !this.isRoomConnected) {
            return;
        }
        await this.room.localParticipant.setMicrophoneEnabled(false);
    }

    public async unmute(): Promise<void> {
        if (!this.room || !this.isRoomConnected) {
            return;
        }
        await this.room.localParticipant.setMicrophoneEnabled(true);
    }

    public async startVideo(): Promise<MediaStream | null> {
        logErr('CallClient.startVideo: not yet implemented');
        return null;
    }

    public stopVideo(): void {
        logErr('CallClient.stopVideo: not yet implemented');
    }

    public async setVideoInputDevice(_device: MediaDeviceInfo): Promise<void> {
        logErr('CallClient.setVideoInputDevice: not yet implemented');
    }

    public getVideoDevices(): MediaDeviceInfo[] {
        return [];
    }

    public getRemoteVideoStream(): MediaStream | null {
        return null;
    }

    public raiseHand(): void {
        logErr('CallClient.raiseHand: not yet implemented');
    }

    public unraiseHand(): void {
        logErr('CallClient.unraiseHand: not yet implemented');
    }

    public async shareScreen(_sourceID?: string, _withAudio?: boolean): Promise<MediaStream | null> {
        logErr('CallClient.shareScreen: not yet implemented');
        return null;
    }

    public unshareScreen(): void {
        logErr('CallClient.unshareScreen: not yet implemented');
    }

    public async setScreenStream(_stream: MediaStream): Promise<void> {
        logErr('CallClient.setScreenStream: not yet implemented');
    }

    public async setBlurSettings(_blurEnabled: boolean, _blurIntensity: number): Promise<void> {
        logErr('CallClient.setBlurSettings: not yet implemented');
    }

    public async setAudioInputDevice(device: MediaDeviceInfo, store: boolean = true): Promise<void> {
        if (store) {
            window.localStorage.setItem(STORAGE_CALLS_DEFAULT_AUDIO_INPUT_KEY, JSON.stringify({
                deviceId: device.deviceId,
                label: device.label,
            }));
        }

        this.currentAudioInputDevice = device;

        // LiveKit handles the published-track swap; no manual replaceTrack needed.
        if (this.room && this.isRoomConnected) {
            try {
                await this.room.switchActiveDevice('audioinput', device.deviceId);
            } catch (err) {
                logErr('CallClient.setAudioInputDevice: failed to switch device', device.deviceId, err);
            }
        }

        this.emit(CALL_EVENT.DEVICE_CHANGE, this.audioDevices, []);
    }

    public async setAudioOutputDevice(device: MediaDeviceInfo, store: boolean = true): Promise<void> {
        if (store) {
            window.localStorage.setItem(STORAGE_CALLS_DEFAULT_AUDIO_OUTPUT_KEY, JSON.stringify({
                deviceId: device.deviceId,
                label: device.label,
            }));
        }

        this.currentAudioOutputDevice = device;

        // Output sinkId routing is owned by call_widget — it applies setSinkId() on the
        // audio elements it creates after this method resolves. Calling LiveKit's
        // switchActiveDevice('audiooutput', …) here would create a second sinkId path.

        this.emit(CALL_EVENT.DEVICE_CHANGE, this.audioDevices, []);
    }

    public sendUserReaction(_data: EmojiData): void {
        logErr('CallClient.sendUserReaction: not yet implemented');
    }

    // Getters return safe defaults rather than throwing — they're called from
    // component lifecycle (componentDidMount), not user gestures, so they
    // must always be safe to invoke regardless of feature implementation state.
    public getAudioDevices(): MediaDevices {
        return this.audioDevices;
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

    public getSessionID() {
        if (!this.room?.localParticipant) {
            return null;
        }

        const {sessionID} = this.parseUserIdAndSessionIdFromIdentity(this.room.localParticipant);
        return sessionID;
    }

    // ------------------------------------------------------------
    // Private methods
    // ------------------------------------------------------------

    private async fetchJwtTokenAndUrl(channelID: string, sessionID: string): Promise<RtcTokenResponse> {
        const params = new URLSearchParams({channel_id: channelID, session_id: sessionID});
        const url = `${getPluginPath()}/${CALL_TOKEN_API_PATH}?${params.toString()}`;
        return RestClient.fetch<RtcTokenResponse>(url, {method: 'GET'});
    }

    private parseUserIdAndSessionIdFromIdentity(p: Participant): {userID: string; sessionID: string} {
        const parts = p.identity.split(USER_ID_SESSION_ID_SEPARATOR);
        if (parts.length !== 2) {
            return {userID: '', sessionID: p.identity};
        }

        const [userID, sessionID] = parts;
        return {
            userID,
            sessionID,
        };
    }

    private handleWebsocketOpened(originalConnID: string, prevConnID: string, isReconnect: boolean) {
        if (!this.connectPayload) {
            logErr('CallClient: ws open received without connect payload');
            return;
        }

        if (isReconnect) {
            logDebug('CallClient: ws reconnect, sending reconnect msg');
            this.websocketClient?.sendReconnect({
                channelID: this.connectPayload.channelID,
                originalConnID,
                prevConnID,
            });
        } else {
            logDebug('CallClient: ws open, sending join msg');
            this.websocketClient?.sendJoin(this.connectPayload);
        }
    }

    private handleWebsocketJoined() {
        logDebug('CallClient: pluginWS join ack received');
    }

    private handleWebsocketMessageReceived({data}: {data: string}) {
        try {
            const msg = JSON.parse(data);
            if (!msg) {
                logErr('ws.on(message): invalid message', data);
            }
            logDebug('ws.on(message): message received', msg);
        } catch (err) {
            logErr('ws.on(message): failed to handle message', err, 'data:', data);
        }
    }

    private handleWebsocketErrored(err: WebSocketError) {
        logErr('CallClient: ws error', err);

        switch (err.type) {
        case WebSocketErrorType.Native:
            break;
        case WebSocketErrorType.ReconnectTimeout:
            this.websocketClient = null;
            this.disconnect(err);
            break;
        case WebSocketErrorType.Join:
            this.disconnect(err);
            break;
        default:
        }
    }

    private handleWebsocketClosed(code?: number) {
        logDebug(`CallClient: ws close: ${code}`);
    }

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
        const {userID: localUserId, sessionID: localSessionID} = this.parseUserIdAndSessionIdFromIdentity(localParticipant);
        this.emit(CALL_EVENT.USER_JOINED, localSessionID, localUserId, true);

        const isLocalMicMuted = localParticipant.getTrackPublication(Track.Source.Microphone)?.isMuted ?? true;
        this.emit(isLocalMicMuted ? CALL_EVENT.MUTE : CALL_EVENT.UNMUTE, localSessionID, localUserId);

        for (const remoteParticipant of this.room.remoteParticipants.values()) {
            const {userID: remoteUserId, sessionID: remoteSessionID} = this.parseUserIdAndSessionIdFromIdentity(remoteParticipant);
            this.emit(CALL_EVENT.USER_JOINED, remoteSessionID, remoteUserId, true);

            const isRemoteMicMuted = remoteParticipant.getTrackPublication(Track.Source.Microphone)?.isMuted ?? true;
            this.emit(isRemoteMicMuted ? CALL_EVENT.MUTE : CALL_EVENT.UNMUTE, remoteSessionID, remoteUserId);
        }

        this.emit(CALL_EVENT.CONNECTED);
    }

    private async requestMicrophonePermission() {
        try {
            // Just request permission to the microphone and
            // stop the track immediately to avoid any audio being published
            const mediaStream = await navigator.mediaDevices.getUserMedia({audio: true});
            mediaStream.getTracks().forEach((mediaStreamTrack) => {
                mediaStreamTrack.stop();
            });

            logDebug('CallClient: microphone permission granted');

            // enumerateDevices() returns devices with empty labels
            // until getUserMedia has resolved successfully.
            await this.enumerateDevices();
            this.emit(CALL_EVENT.DEVICE_CHANGE, this.audioDevices, []);

            this.emit(CALL_EVENT.INIT_AUDIO);
        } catch (err) {
            const isPermissionDenied = err instanceof Error && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError');
            this.emit(CALL_EVENT.ERROR, isPermissionDenied ? AudioInputPermissionsError : err);
        }
    }

    private handleConnectionStateChanged(state: ConnectionState) {
        logDebug('CallClient: connection state changed', state);
    }

    private handleReconnecting() {
        logDebug('CallClient: reconnecting to room');

        this.emit(CALL_EVENT.RECONNECTING);
    }

    private handleReconnected() {
        logDebug('CallClient: reconnected to room');

        this.emit(CALL_EVENT.RECONNECTED);
    }

    private handleDisconnected(reason?: DisconnectReason) {
        logDebug('CallClient: disconnected from room', reason);

        this.isRoomConnected = false;
        this.connectPayload = null;

        this.emit(CALL_EVENT.DISCONNECTED, reason);
    }

    /**
     * Fires when a remote participant's audio bits start flowing to us.
     * We wrap the track in a MediaStream and ship it to the widget for `<audio>` playback.
     */
    private handleTrackSubscribed(track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) {
        if (track.source === Track.Source.Microphone) {
            const stream = new MediaStream([track.mediaStreamTrack]);
            const {userID, sessionID} = this.parseUserIdAndSessionIdFromIdentity(participant);
            this.emit(CALL_EVENT.REMOTE_VOICE_STREAM, stream, sessionID, userID);

            logDebug(`CallClient: remote user ${userID} subscribed to track`);
        }
    }

    /**
     * Fires when our own mic track is created and published (e.g., user's first unmute).
     * Emits the initial mute/unmute state.
     */
    private handleLocalTrackPublished(localTrackPublication: LocalTrackPublication, localParticipant: LocalParticipant) {
        if (localTrackPublication.source === Track.Source.Microphone) {
            const {userID, sessionID} = this.parseUserIdAndSessionIdFromIdentity(localParticipant);
            this.emit(localTrackPublication.isMuted ? CALL_EVENT.MUTE : CALL_EVENT.UNMUTE, sessionID, userID);

            logDebug(`CallClient: local track published from ${userID}`, localTrackPublication);
        }
    }

    /**
     * Fires when our own mic track is fully torn down (disconnect, explicit unpublish).
     * Emits MUTE since "no publication" means muted in our UI.
     */
    private handleLocalTrackUnpublished(localTrackPublication: LocalTrackPublication, localParticipant: LocalParticipant) {
        if (localTrackPublication.source === Track.Source.Microphone) {
            const {userID, sessionID} = this.parseUserIdAndSessionIdFromIdentity(localParticipant);
            this.emit(CALL_EVENT.MUTE, sessionID, userID);

            logDebug(`CallClient: local track unpublished from ${userID}`, localTrackPublication);
        }
    }

    /**
     * Fires when a remote participant publishes a mic track (e.g., they unmute for the first time).
     * Emits the initial mute/unmute state for that participant based on `pub.isMuted`.
     */
    private handleTrackPublished(remoteTrackPublication: RemoteTrackPublication, remoteParticipant: RemoteParticipant) {
        if (remoteTrackPublication.source === Track.Source.Microphone) {
            const {userID, sessionID} = this.parseUserIdAndSessionIdFromIdentity(remoteParticipant);
            this.emit(remoteTrackPublication.isMuted ? CALL_EVENT.MUTE : CALL_EVENT.UNMUTE, sessionID, userID);

            logDebug(`CallClient: remote track published from ${userID}`, remoteTrackPublication);
        }
    }

    /**
     * Fires when a remote participant tears down their mic track (rare; usually only on leave).
     * Treats "no publication" as muted and emits MUTE for that participant.
     */
    private handleTrackUnpublished(remoteTrackPublication: RemoteTrackPublication, remoteParticipant: RemoteParticipant) {
        if (remoteTrackPublication.source === Track.Source.Microphone) {
            const {userID, sessionID} = this.parseUserIdAndSessionIdFromIdentity(remoteParticipant);
            this.emit(CALL_EVENT.MUTE, sessionID, userID);

            logDebug(`CallClient: remote track unpublished from ${userID}`, remoteTrackPublication);
        }
    }

    /**
     * Fires when any participant (local or remote) mutes an existing mic publication.
     * Emits MUTE keyed by that participant's sid + identity.
     */
    private handleTrackMuted(trackPublication: TrackPublication, participant: Participant) {
        if (trackPublication.source === Track.Source.Microphone) {
            const {userID, sessionID} = this.parseUserIdAndSessionIdFromIdentity(participant);
            this.emit(CALL_EVENT.MUTE, sessionID, userID);

            logDebug(`CallClient: track muted from ${userID}`, trackPublication);
        }
    }

    /**
     * Fires when any participant (local or remote) unmutes an existing mic publication.
     * Emits UNMUTE keyed by that participant's sid + identity.
     */
    private handleTrackUnmuted(trackPublication: TrackPublication, participant: Participant) {
        if (trackPublication.source === Track.Source.Microphone) {
            const {userID, sessionID} = this.parseUserIdAndSessionIdFromIdentity(participant);
            this.emit(CALL_EVENT.UNMUTE, sessionID, userID);

            logDebug(`CallClient: track unmuted from ${userID}`, trackPublication);
        }
    }

    /**
     * Fires when a remote participant joins the room (after we have already connected).
     * Emits USER_JOINED so the dispatcher can populate Redux + play the join sound.
     */
    private handleParticipantConnected(remoteParticipant: RemoteParticipant) {
        const {userID, sessionID} = this.parseUserIdAndSessionIdFromIdentity(remoteParticipant);
        this.emit(CALL_EVENT.USER_JOINED, sessionID, userID);

        logDebug(`CallClient: participant connected ${userID}`);
    }

    /**
     * Fires when a remote participant leaves the room.
     * Emits USER_LEFT so the dispatcher can drop the session from Redux.
     */
    private handleParticipantDisconnected(remoteParticipant: RemoteParticipant) {
        const {userID, sessionID} = this.parseUserIdAndSessionIdFromIdentity(remoteParticipant);
        this.emit(CALL_EVENT.USER_LEFT, sessionID, userID);

        logDebug(`CallClient: participant disconnected ${userID}`);
    }

    private handleMediaDevicesError(err: Error) {
        logErr('CallClient: media device error', err);
        this.emit(CALL_EVENT.ERROR, err);
    }

    /**
     * Fires whenever LiveKit recomputes who's currently speaking.
     * e.g. N users speaking -> N participants array
     * conversely if no one is speaking -> empty array
     */
    private handleActiveSpeakersChanged(participants: Participant[]) {
        const user_ids: string[] = [];
        const session_ids: string[] = [];

        // This is fine as data structure but if we ever want to have audio
        // level then it would be better to have a tuple of [session_id, user_id, audio_level]
        for (const participant of participants) {
            const {userID, sessionID} = this.parseUserIdAndSessionIdFromIdentity(participant);
            session_ids.push(sessionID);
            user_ids.push(userID);
        }

        this.emit(CALL_EVENT.USERS_VOICE_ACTIVITY_CHANGED, session_ids, user_ids);
    }

    /**
     * Fires when the OS-level set of media devices changes (plug/unplug, permission grant).
     * Re-enumerates, falls back to the system default if the active device disappeared,
     * and broadcasts the new inventory so picker UIs refresh.
     */
    private async handleMediaDevicesChanged() {
        await this.enumerateDevices();

        if (this.currentAudioInputDevice) {
            const stillPresent = this.audioDevices.inputs.some((dev) => dev.deviceId === this.currentAudioInputDevice?.deviceId);
            if (!stillPresent) {
                const unplugged = this.currentAudioInputDevice;
                const fallback = this.audioDevices.inputs[0] ?? null;
                if (fallback) {
                    await this.setAudioInputDevice(fallback, false);
                } else {
                    this.currentAudioInputDevice = null;
                }
                this.emit(CALL_EVENT.DEVICE_FALLBACK, unplugged);
            }
        }

        if (this.currentAudioOutputDevice) {
            const stillPresent = this.audioDevices.outputs.some((dev) => dev.deviceId === this.currentAudioOutputDevice?.deviceId);
            if (!stillPresent) {
                const unplugged = this.currentAudioOutputDevice;
                const fallback = this.audioDevices.outputs[0] ?? null;
                if (fallback) {
                    await this.setAudioOutputDevice(fallback, false);
                } else {
                    this.currentAudioOutputDevice = null;
                }
                this.emit(CALL_EVENT.DEVICE_FALLBACK, unplugged);
            }
        }

        this.emit(CALL_EVENT.DEVICE_CHANGE, this.audioDevices, []);
    }

    private async enumerateDevices(): Promise<MediaDevices> {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.audioDevices = {
                inputs: devices.filter((dev) => dev.kind === 'audioinput'),
                outputs: devices.filter((dev) => dev.kind === 'audiooutput'),
            };
        } catch (err) {
            logErr('CallClient: failed to enumerate devices', err);
        }
        return this.audioDevices;
    }

    /**
     * Looks up the user's last-selected device for `kind` from localStorage and matches
     * it against the freshly enumerated list. Tolerates the legacy raw-string format
     * stored before MM-63274.
     */
    private getStoredAudioDevice(kind: 'input' | 'output'): MediaDeviceInfo | null {
        const storageKey = kind === 'input' ? STORAGE_CALLS_DEFAULT_AUDIO_INPUT_KEY : STORAGE_CALLS_DEFAULT_AUDIO_OUTPUT_KEY;
        const data = window.localStorage.getItem(storageKey);
        if (!data) {
            return null;
        }

        let stored: {deviceId: string; label?: string};
        try {
            stored = JSON.parse(data);
        } catch {
            // Backwards compatibility for the pre-MM-63274 raw-string format.
            stored = {deviceId: data};
        }

        if (!stored.deviceId) {
            return null;
        }

        const devices = kind === 'input' ? this.audioDevices.inputs : this.audioDevices.outputs;
        const matches = devices.filter((dev) => dev.deviceId === stored.deviceId || dev.label === stored.label);
        if (matches.length === 0) {
            return null;
        }
        if (matches.length > 1) {
            return matches.find((dev) => dev.deviceId === stored.deviceId) ?? null;
        }
        return matches[0];
    }

    private async restoreAudioDevicesFromStorage() {
        await this.enumerateDevices();

        const storedInput = this.getStoredAudioDevice('input');
        if (storedInput) {
            await this.setAudioInputDevice(storedInput, false);
        }

        const storedOutput = this.getStoredAudioDevice('output');
        if (storedOutput) {
            await this.setAudioOutputDevice(storedOutput, false);
        }

        // Always emit so the widget's componentDidMount listener picks up the
        // initial inventory even when nothing was restored from localStorage.
        this.emit(CALL_EVENT.DEVICE_CHANGE, this.audioDevices, []);
    }
}
