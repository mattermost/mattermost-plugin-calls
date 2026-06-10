// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/* eslint-disable max-lines */

import type {EmojiData} from '@mattermost/calls-common/lib/types';
import {ClientConfig} from '@mattermost/types/config';
import {EventEmitter} from 'events';
import {
    ConnectionQuality,
    ConnectionState,
    DisconnectReason,
    LocalAudioTrack,
    LocalParticipant,
    LocalTrack,
    LocalTrackPublication,
    LocalVideoTrack,
    MediaDeviceFailure,
    Participant,
    RemoteParticipant,
    RemoteTrack,
    RemoteTrackPublication,
    Room,
    RoomEvent,
    ScreenShareCaptureOptions,
    Track,
    TrackPublication,
} from 'livekit-client';
import RestClient from 'src/clients/rest';
import {WEBSOCKET_EVENT, WebSocketClient, WebSocketError, WebSocketErrorType} from 'src/clients/websocket';
import {AudioInputPermissionsErr} from 'src/components/error_modal/error_messages';
import {
    STORAGE_CALLS_DEFAULT_AUDIO_INPUT_KEY,
    STORAGE_CALLS_DEFAULT_AUDIO_OUTPUT_KEY,
} from 'src/constants';
import {logDebug, logErr, logInfo, logWarn} from 'src/log';
import {CallsClientStats, MediaDevices} from 'src/types/types';
import {getPluginPath, getScreenStream} from 'src/utils';

import {
    AUDIO_CAPTURE_DEFAULTS,
    CALL_ATTRIBUTES,
    CALL_EVENT,
    CALL_MESSAGE_TOPICS,
    CALL_TOKEN_API_PATH,
    TRACK_PUBLISHING_DEFAULTS,
    USER_ID_SESSION_ID_SEPARATOR,
} from './constants';
import {ConnectPayload, ReactionPayload, RtcTokenResponse} from './types';

export default class CallClient extends EventEmitter {
    public channelID = '';
    public initTime = 0;
    public currentAudioInputDevice: MediaDeviceInfo | null = null;
    public currentAudioOutputDevice: MediaDeviceInfo | null = null;

    private websocketClient: WebSocketClient | null = null;
    private room: Room | null = null;
    private roomConnected = false;
    private disconnecting = false;
    private disconnected = false;
    private connectPayload: ConnectPayload | null = null;

    // Cached enumerated audio devices so we can call getAudioDevices() synchronously
    private audioDevices: MediaDevices = {inputs: [], outputs: []};

    constructor({websocketURL, authToken}: {
        websocketURL: ClientConfig['WebsocketURL'];
        authToken?: string;
    }) {
        super();

        const websocketClient = new WebSocketClient(websocketURL, authToken);
        this.websocketClient = websocketClient;
        websocketClient.on(WEBSOCKET_EVENT.OPEN, this.handleWebsocketOpened.bind(this));
        websocketClient.on(WEBSOCKET_EVENT.JOIN, this.handleWebsocketJoined.bind(this));
        websocketClient.on(WEBSOCKET_EVENT.MESSAGE, this.handleWebsocketMessageReceived.bind(this));
        websocketClient.on(WEBSOCKET_EVENT.EVENT, this.handleWebsocketEvent.bind(this));
        websocketClient.on(WEBSOCKET_EVENT.ERROR, this.handleWebsocketErrored.bind(this));
        websocketClient.on(WEBSOCKET_EVENT.CLOSE, this.handleWebsocketClosed.bind(this));

        const room = new Room({
            audioCaptureDefaults: AUDIO_CAPTURE_DEFAULTS,

            // adaptiveStream/dynacast are disabled so screen shares always send
            // full resolution (MM-69110). adaptiveStream picks a subscriber's
            // layer from the rendered element size, but it observes via
            // ResizeObserver in the window that owns the track — it cannot
            // measure the popout's <video> (separate window) and only ever sees
            // the tiny widget preview, so it pinned everyone to the lowest
            // simulcast layer (540p). Screen share wants sharp text regardless
            // of pane size, so element-driven adaptation is the wrong tradeoff
            // here. dynacast is off too so the high layer is always encoded.
            dynacast: false,
            adaptiveStream: false,
            disconnectOnPageLeave: true,
            publishDefaults: TRACK_PUBLISHING_DEFAULTS,
        });
        this.room = room;
        room.on(RoomEvent.Connected, this.handleConnected.bind(this));
        room.on(RoomEvent.ConnectionStateChanged, this.handleConnectionStateChanged.bind(this));
        room.on(RoomEvent.Reconnecting, this.handleReconnecting.bind(this));
        room.on(RoomEvent.Reconnected, this.handleReconnected.bind(this));
        room.on(RoomEvent.Disconnected, this.handleDisconnected.bind(this));
        room.on(RoomEvent.LocalTrackPublished, this.handleLocalTrackPublished.bind(this));
        room.on(RoomEvent.LocalTrackUnpublished, this.handleLocalTrackUnpublished.bind(this));
        room.on(RoomEvent.TrackPublished, this.handleRemoteTrackPublished.bind(this));
        room.on(RoomEvent.TrackSubscribed, this.handleRemoteTrackSubscribed.bind(this));
        room.on(RoomEvent.TrackUnpublished, this.handleRemoteTrackUnpublished.bind(this));
        room.on(RoomEvent.TrackMuted, this.handleTrackMuted.bind(this));
        room.on(RoomEvent.TrackUnmuted, this.handleTrackUnmuted.bind(this));
        room.on(RoomEvent.ParticipantConnected, this.handleParticipantConnected.bind(this));
        room.on(RoomEvent.ParticipantDisconnected, this.handleParticipantDisconnected.bind(this));
        room.on(RoomEvent.ParticipantAttributesChanged, this.handleParticipantAttributesChanged.bind(this));
        room.on(RoomEvent.ActiveSpeakersChanged, this.handleActiveSpeakersChanged.bind(this));
        room.on(RoomEvent.DataReceived, this.handleDataReceivedFromParticipant.bind(this));
        room.on(RoomEvent.MediaDevicesChanged, this.handleMediaDevicesChanged.bind(this));
        room.on(RoomEvent.MediaDevicesError, this.handleMediaDevicesError.bind(this));
        room.on(RoomEvent.ActiveDeviceChanged, this.handleActiveDeviceChanged.bind(this));
        room.on(RoomEvent.ConnectionQualityChanged, this.handleConnectionQualityChanged.bind(this));
    }

    // True while the LiveKit room is connected and we haven't torn down. Note this
    // reflects the media plane only; plugin call state (host/sessions) hydrates via WS
    // separately, so callers needing that should wait on it themselves (see MM-69019).
    public get isConnected(): boolean {
        return this.roomConnected && !this.disconnected;
    }

    public get isDisconnected(): boolean {
        return this.disconnected;
    }

    // Back-compat aliases for the calls-recorder, which polls
    // window.callsClient.connected and .closed to decide when to start/stop the
    // ffmpeg capture. The recorder is media-stack-agnostic and shared across
    // versions, so we satisfy its existing contract here rather than couple it to
    // the v2 LiveKit naming.
    public get connected(): boolean {
        return this.isConnected;
    }

    public get closed(): boolean {
        return this.isDisconnected;
    }

    // _e2eForceWebsocketClose closes the plugin WebSocket without telling the
    // client to stay closed, so reconnect logic runs — used by E2E tests to
    // exercise the WS-reconnect path.
    public _e2eForceWebsocketClose(): void {
        this.websocketClient?.e2eForceClose();
    }

    public async connect(connectPayload: ConnectPayload): Promise<void> {
        if (this.roomConnected) {
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
            // If the user cancelled the call before it connected, we will have already teared down
            if (this.disconnecting) {
                logDebug('CallClient: connect aborted by concurrent disconnect (during pluginWS connect)');
                return;
            }

            logErr('CallClient: pluginWS connection error', err);
            this.connectPayload = null;

            // RoomEvent.Disconnected never fires for a pre-Connected failure, so clean up
            this.websocketClient?.close();
            this.websocketClient = null;

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
            // If the user cancelled the network request before it connected, we will have already teared down
            if (this.disconnecting) {
                logDebug('CallClient: connect aborted by concurrent disconnect (during token fetch)');
                return;
            }

            logErr('CallClient: token fetch error', err);
            this.connectPayload = null;

            // The plugin WS is already open and the join was sent, so tell the server we're
            // leaving before closing — otherwise it keeps the session until its own timeout.
            this.websocketClient?.sendLeave();
            this.websocketClient?.close();
            this.websocketClient = null;

            this.emit(CALL_EVENT.ERROR, err);
            throw err;
        }

        try {
            await this.room.prepareConnection(url, token);
        } catch (prepareErr) {
            // A disconnect() may have raced in during the awaits above.
            if (this.disconnecting) {
                logDebug('CallClient: connect aborted by concurrent disconnect (during prepareConnection)');
                return;
            }

            logWarn('CallClient: prepareConnection failed though it is non-fatal', prepareErr);
        }

        try {
            await this.room.connect(url, token);
            this.roomConnected = true;

            logDebug('CallClient: room connected');
        } catch (err) {
            // A cancel during room.connect() makes LiveKit reject with a Cancelled error.
            if (this.disconnecting) {
                logDebug('CallClient: connect aborted by concurrent disconnect (during room.connect)');
                return;
            }

            logErr('CallClient: room connection error', err);
            this.roomConnected = false;
            this.connectPayload = null;
            this.room = null;

            // The plugin WS is already open and the join was sent, so tell the server we're
            // leaving before closing — otherwise it keeps the session until its own timeout.
            this.websocketClient?.sendLeave();
            this.websocketClient?.close();
            this.websocketClient = null;

            this.emit(CALL_EVENT.ERROR, err);
            throw err;
        }
    }

    // The single public entry point to end a call. In the normal case it ONLY
    // initiates a LiveKit disconnect and does no teardown itself; all teardown is
    // driven by the resulting RoomEvent.Disconnected -> handleDisconnected().
    public disconnect(): Promise<void> {
        // Already torn down — nothing to wait for.
        if (this.disconnected) {
            return Promise.resolve();
        }
        this.disconnecting = true;

        const isDisconnectCompleted = new Promise<void>((resolve) => this.once(CALL_EVENT.DISCONNECTED, () => resolve()));

        if (this.room && this.room.state !== ConnectionState.Disconnected) {
            this.room.disconnect();
        } else {
            // But! If room is already disconnected, run handleDisconnected directly since room.disconnect()
            //  will not emit the event. This ensures teardown still occurs.
            this.handleDisconnected(DisconnectReason.CLIENT_INITIATED);
        }

        return isDisconnectCompleted;
    }

    public async mute(): Promise<void> {
        if (!this.room || !this.roomConnected) {
            return;
        }

        try {
            await this.room.localParticipant.setMicrophoneEnabled(false);
        } catch (err) {
            logErr('CallClient: muting microphone failed', err);
        }
    }

    public async unmute(): Promise<void> {
        if (!this.room || !this.roomConnected) {
            return;
        }

        try {
            await this.room.localParticipant.setMicrophoneEnabled(true);
        } catch (err) {
            if (MediaDeviceFailure.getFailure(err) === MediaDeviceFailure.PermissionDenied) {
                logDebug('CallClient: unmuting microphone denied, missing audio input permission');
                this.emit(CALL_EVENT.ERROR, AudioInputPermissionsErr);
            } else {
                logErr('CallClient: unmuting microphone failed', err);
                this.emit(CALL_EVENT.ERROR, err);
            }
        }
    }

    public async raiseHand(): Promise<void> {
        if (!this.room || !this.roomConnected) {
            return;
        }

        try {
            await this.room.localParticipant.setAttributes({[CALL_ATTRIBUTES.RAISED_HAND]: String(Date.now())});
        } catch (err) {
            logErr('CallClient: raising hand failed', err);
        }
    }

    public async unraiseHand(): Promise<void> {
        if (!this.room || !this.roomConnected) {
            return;
        }

        try {
            await this.room.localParticipant.setAttributes({[CALL_ATTRIBUTES.RAISED_HAND]: ''});
        } catch (err) {
            logErr('CallClient: unraising hand failed', err);
        }
    }

    public async shareScreen(sourceID?: string, withAudio?: boolean): Promise<MediaStream | null> {
        if (!this.room || !this.roomConnected) {
            return null;
        }

        // If we're already sharing, return the existing stream.
        if (this.room.localParticipant.getTrackPublication(Track.Source.ScreenShare)) {
            logDebug('CallClient: you are already sharing screen');
            return this.getLocalScreenStream();
        }

        // If another participant is already sharing, we skip.
        for (const remoteParticipant of this.room.remoteParticipants.values()) {
            if (remoteParticipant.getTrackPublication(Track.Source.ScreenShare)) {
                logDebug('CallClient: another participant is already sharing screen');
                return null;
            }
        }

        try {
            if (window.desktop) {
                await this.shareScreenInDesktop(sourceID, withAudio);
            } else {
                // Browser: let LiveKit drive getDisplayMedia + its native picker / "Stop sharing" bar.
                // Only hint systemAudio when audio capture is actually requested.
                const captureOptions: ScreenShareCaptureOptions = {audio: Boolean(withAudio)};
                if (withAudio) {
                    captureOptions.systemAudio = 'include';
                }
                await this.room.localParticipant.setScreenShareEnabled(true, captureOptions);
            }

            const stream = this.getLocalScreenStream();
            logDebug('CallClient: screen share stream started', {sourceID, withAudio, streamID: stream?.id});
            return stream;
        } catch (err) {
            if (MediaDeviceFailure.getFailure(err) === MediaDeviceFailure.PermissionDenied) {
                logDebug('CallClient: screen share was either cancelled or permissions were denied');
            } else {
                logErr('CallClient: sharing screen failed', err);
                this.emit(CALL_EVENT.ERROR, err);
            }
            return null;
        }
    }

    // shareScreenInDesktop captures and publishes the source already chosen via
    // Electron's desktopCapturer picker. LiveKit's setScreenShareEnabled() would
    // call getDisplayMedia() and ignore the chosen sourceID, so we capture that
    // specific source ourselves (getScreenStream uses getUserMedia +
    // chromeMediaSourceId) and publish the tracks tagged as ScreenShare,
    // mirroring LiveKit's own createScreenTracks().
    private async shareScreenInDesktop(sourceID?: string, withAudio?: boolean): Promise<void> {
        if (!this.room) {
            return;
        }

        const screenStream = await getScreenStream(sourceID, withAudio);
        if (!screenStream) {
            return;
        }

        const publishedTracks: LocalTrack[] = [];
        try {
            const [videoTrack] = screenStream.getVideoTracks();
            if (videoTrack) {
                const screenVideo = new LocalVideoTrack(videoTrack, undefined, false);
                screenVideo.source = Track.Source.ScreenShare;
                await this.room.localParticipant.publishTrack(screenVideo);
                publishedTracks.push(screenVideo);
            }

            const [audioTrack] = screenStream.getAudioTracks();
            if (audioTrack) {
                const screenAudio = new LocalAudioTrack(audioTrack, undefined, false);
                screenAudio.source = Track.Source.ScreenShareAudio;
                await this.room.localParticipant.publishTrack(screenAudio);
                publishedTracks.push(screenAudio);
            }
        } catch (err) {
            // Roll back any partial publishes so we don't leave a live ScreenShare
            // track behind, which would desync LiveKit and plugin WS state. Use
            // allSettled so a teardown failure can't mask the original publish
            // error (err), which is what we actually want to surface.
            await Promise.allSettled(publishedTracks.map((track) => this.room!.localParticipant.unpublishTrack(track, true)));
            screenStream.getTracks().forEach((track) => track.stop());
            throw err;
        }
    }

    public async unshareScreen(): Promise<void> {
        if (!this.room || !this.roomConnected) {
            return;
        }

        try {
            // handleLocalTrackUnpublished will fire and emit LOCAL_SCREEN_STREAM_OFF.
            // We await the unpublish before telling the server so server-side state
            // only flips to "off" once LiveKit has actually torn down the publication.
            await this.room.localParticipant.setScreenShareEnabled(false);
            this.websocketClient?.sendScreenOff();
        } catch (err) {
            logErr('CallClient: unsharing screen failed', err);
            this.emit(CALL_EVENT.ERROR, err);
        }
    }

    public async setAudioInputDevice(device: MediaDeviceInfo, store: boolean = true): Promise<void> {
        if (!this.room) {
            return;
        }

        if (!this.roomConnected) {
            return;
        }

        // LiveKit handles the published-track swap; no manual replaceTrack needed.
        // Only persist and update state after the switch succeeds, so a failure
        // leaves the previous active device intact (no UI/state inconsistency).
        try {
            await this.room.switchActiveDevice('audioinput', device.deviceId, true);

            if (store) {
                window.localStorage.setItem(STORAGE_CALLS_DEFAULT_AUDIO_INPUT_KEY, JSON.stringify({
                    deviceId: device.deviceId,
                    label: device.label,
                }));
            }
            this.currentAudioInputDevice = device;

            logDebug('CallClient: audio input device switch successful', {deviceId: device.deviceId, label: device.label});
            this.emit(CALL_EVENT.DEVICE_CHANGE, this.audioDevices);
        } catch (err) {
            logErr('CallClient: audio input device switch failed',
                {requestedDeviceId: device.deviceId, requestedLabel: device.label, errName: (err instanceof Error) ? err.name : 'unknown', err});
        }
    }

    public setAudioOutputDevice(device: MediaDeviceInfo, store: boolean = true): void {
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

        logDebug('CallClient: audio output device change requested', {deviceId: device.deviceId, label: device.label});
        this.emit(CALL_EVENT.DEVICE_CHANGE, this.audioDevices);
    }

    public async sendReaction(emojiData: EmojiData) {
        if (!this.room || !this.roomConnected) {
            return;
        }

        const localParticipant = this.room.localParticipant;
        const {userID, sessionID} = this.parseUserIdAndSessionIdFromIdentity(this.room.localParticipant);
        const timestamp = Date.now();

        try {
            const reactionPayload: ReactionPayload = {emojiData, timestamp};
            const encodedReactionPayload = new TextEncoder().encode(JSON.stringify(reactionPayload));
            await localParticipant.publishData(encodedReactionPayload, {reliable: true, topic: CALL_MESSAGE_TOPICS.REACTION});

            logDebug('CallClient: reaction sent successfully', {emojiData, timestamp});
            this.emit(CALL_EVENT.REACTION, sessionID, userID, emojiData, timestamp);
        } catch (err) {
            logErr('CallClient: reactions failed to send', err);
        }
    }

    // Getters return safe defaults rather than throwing — they're called from
    // component lifecycle (componentDidMount), not user gestures, so they
    // must always be safe to invoke regardless of feature implementation state.
    public getAudioDevices(): MediaDevices {
        return this.audioDevices;
    }

    public getLocalScreenStream(): MediaStream | null {
        if (!this.room) {
            return null;
        }
        return this.composeScreenShareStream(this.room.localParticipant);
    }

    public getRemoteScreenStream(): MediaStream | null {
        if (!this.room) {
            return null;
        }

        // Only one participant is allowed to share at a time; first match wins.
        for (const p of this.room.remoteParticipants.values()) {
            const stream = this.composeScreenShareStream(p);
            if (stream) {
                return stream;
            }
        }
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

    private handleWebsocketOpened(originalConnID: string, prevConnID: string, isReconnect: boolean) {
        if (!this.connectPayload) {
            logErr('CallClient: pluginWS open received without connect payload');
            return;
        }

        if (isReconnect) {
            logDebug('CallClient: pluginWS reconnect, sending reconnect msg');
            this.websocketClient?.sendReconnect({
                channelID: this.connectPayload.channelID,
                originalConnID,
                prevConnID,
            });
        } else {
            logDebug('CallClient: pluginWS open, sending join msg');
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
                logErr('CallClient: pluginWS on(message): invalid message', data);
                return;
            }
            logDebug('CallClient: pluginWS on(message): message received', msg);
        } catch (err) {
            logErr('CallClient: pluginWS on(message): failed to handle message', err, 'data:', data);
        }
    }

    private handleWebsocketEvent(event: unknown) {
        this.emit(CALL_EVENT.WEBSOCKET_EVENT, event);
    }

    private handleWebsocketErrored(err: WebSocketError) {
        switch (err.type) {
        case WebSocketErrorType.Native:{
            // This is transient state, reconnect will be attempted
            logWarn('CallClient: pluginWS transient error, reconnect will be attempted', err);
            break;
        }
        case WebSocketErrorType.ReconnectTimeout: {
            logErr('CallClient: pluginWS reconnect timed out, disconnecting', err);
            this.websocketClient = null;
            this.emit(CALL_EVENT.ERROR, err);
            this.disconnect();
            break;
        }
        case WebSocketErrorType.Join: {
            logErr('CallClient: pluginWS join failed, disconnecting', err);
            this.emit(CALL_EVENT.ERROR, err);
            this.disconnect();
            break;
        }
        default:
            logErr('CallClient: pluginWS errored with unknown type', err);
        }
    }

    private handleWebsocketClosed(code?: number) {
        logDebug(`CallClient: pluginWS close: ${code}`);
    }

    private handleConnected() {
        if (!this.room) {
            return;
        }

        this.roomConnected = true;
        this.initTime = Date.now();

        // Request microphone permission in the background so connection
        // handling is not blocked by the user's interaction.
        void this.requestMicrophonePermission();

        // Seed the initial state for everyone already in the room (local + remote):
        // USER_JOINED creates the session, then the LiveKit-owned fields (mic mute +
        // raised hand) are layered on top.
        const localParticipant = this.room.localParticipant;
        const {userID: localUserId, sessionID: localSessionID} = this.parseUserIdAndSessionIdFromIdentity(localParticipant);
        this.emit(CALL_EVENT.USER_JOINED, localSessionID, localUserId, true);
        this.emitLiveKitOwnedState(localParticipant);

        for (const remoteParticipant of this.room.remoteParticipants.values()) {
            const {userID: remoteUserId, sessionID: remoteSessionID} = this.parseUserIdAndSessionIdFromIdentity(remoteParticipant);
            this.emit(CALL_EVENT.USER_JOINED, remoteSessionID, remoteUserId, true);
            this.emitLiveKitOwnedState(remoteParticipant);
        }

        logDebug(`CallClient: connected and seeded initial state for ${this.room.remoteParticipants.size + 1} participant(s)`);
        this.emit(CALL_EVENT.CONNECTED);
    }

    /**
     * Emits the LiveKit-owned per-participant state — mic mute and raised hand —
     * that the server no longer tracks (those moved to LiveKit, so the plugin-WS
     * call_state ships stale values). Layered on top of an already-created session;
     * does NOT emit USER_JOINED.
     */
    private emitLiveKitOwnedState(participant: Participant) {
        const {userID, sessionID} = this.parseUserIdAndSessionIdFromIdentity(participant);

        const isMicMuted = participant.getTrackPublication(Track.Source.Microphone)?.isMuted ?? true;
        this.emit(isMicMuted ? CALL_EVENT.MUTE : CALL_EVENT.UNMUTE, sessionID, userID);

        const raisedHand = Number(participant.attributes?.[CALL_ATTRIBUTES.RAISED_HAND]);
        if (raisedHand > 0) {
            this.emit(CALL_EVENT.RAISE_HAND, sessionID, userID, raisedHand);
        }
    }

    /**
     * Re-emits the LiveKit-owned mute + raised-hand state for every current
     * participant, without re-emitting USER_JOINED (so existing sessions keep their
     * voice/reaction state). Used by the expanded-view popout to overlay accurate
     * state on top of its WS call_state seed, which carries stale unmuted/raised_hand
     * because the server no longer tracks those fields after the LiveKit migration.
     */
    public reSyncMuteAndHandState() {
        if (!this.room) {
            return;
        }

        this.emitLiveKitOwnedState(this.room.localParticipant);
        for (const remoteParticipant of this.room.remoteParticipants.values()) {
            this.emitLiveKitOwnedState(remoteParticipant);
        }
    }

    private async requestMicrophonePermission() {
        try {
            // Just request permission to the microphone and
            // stop the track immediately to avoid any audio being published
            logDebug('CallClient: requesting microphone permission');
            const mediaStream = await navigator.mediaDevices.getUserMedia({audio: true});
            mediaStream.getTracks().forEach((mediaStreamTrack) => {
                mediaStreamTrack.stop();
            });

            logDebug('CallClient: microphone permission granted');

            // enumerateDevices() returns devices with empty labels
            // until getUserMedia has resolved successfully.
            await this.enumerateDevices();

            // Restore the user's last-selected device now that the inventory
            // has real labels and deviceIds. Matching against the pre-grant
            // stub list would either miss the entry or pin a phantom
            // "default" deviceId that no longer maps to anything. (Gap #5.)
            logDebug('CallClient: restoring stored audio devices from localStorage (post-permission)');
            const storedInput = this.getStoredAudioDevice('input');
            logDebug('CallClient: storedInput resolved to', storedInput ? {deviceId: storedInput.deviceId, label: storedInput.label} : null);
            if (storedInput) {
                await this.setAudioInputDevice(storedInput, false);
            }
            const storedOutput = this.getStoredAudioDevice('output');
            logDebug('CallClient: storedOutput resolved to', storedOutput ? {deviceId: storedOutput.deviceId, label: storedOutput.label} : null);
            if (storedOutput) {
                this.setAudioOutputDevice(storedOutput, false);
            }

            this.emit(CALL_EVENT.DEVICE_CHANGE, this.audioDevices);

            this.emit(CALL_EVENT.INIT_AUDIO);
        } catch (err) {
            if (MediaDeviceFailure.getFailure(err) === MediaDeviceFailure.PermissionDenied) {
                logDebug('CallClient: requesting microphone permission denied by user');
                this.emit(CALL_EVENT.ERROR, AudioInputPermissionsErr);
            } else {
                logErr('CallClient: failed to request microphone permission', err);
                this.emit(CALL_EVENT.ERROR, err);
            }
        }
    }

    private handleConnectionStateChanged(state: ConnectionState) {
        logDebug(`CallClient: connection state changed to '${state}'`);
    }

    private handleReconnecting() {
        logInfo('CallClient: reconnecting to room');

        this.emit(CALL_EVENT.RECONNECTING);
    }

    private handleReconnected() {
        logDebug('CallClient: reconnected to room');

        this.emit(CALL_EVENT.RECONNECTED);
    }

    private handleDisconnected(reason?: DisconnectReason) {
        const disconnectReason = reason ? DisconnectReason[reason] : 'unknown';
        logDebug(`CallClient: room disconnected with reason '${disconnectReason}'`);

        if (this.disconnected) {
            return;
        }

        this.disconnected = true;
        this.roomConnected = false;
        this.connectPayload = null;
        this.room = null;

        this.emit(CALL_EVENT.DISCONNECTED, reason);

        if (this.websocketClient) {
            try {
                this.websocketClient.sendLeave();
                this.websocketClient.close();
            } catch (error) {
                logErr('CallClient: pluginWS teardown error', error);
            } finally {
                this.websocketClient = null;
                logDebug('CallClient: pluginWS disconnected');
            }
        }
    }

    /**
     * Fires when:
     * - our mic track is created and published.
     * - we start sharing our screen.
     * Since this is for us, we are already subscribed to our own tracks as soon as we publish them.
     */
    private handleLocalTrackPublished(localTrackPublication: LocalTrackPublication, localParticipant: LocalParticipant) {
        if (localTrackPublication.source === Track.Source.Microphone) {
            const {userID, sessionID} = this.parseUserIdAndSessionIdFromIdentity(localParticipant);
            this.emit(localTrackPublication.isMuted ? CALL_EVENT.MUTE : CALL_EVENT.UNMUTE, sessionID, userID);

            logDebug(`CallClient: local voice stream published for user ${userID}`, localTrackPublication);
        }

        // Browser renders a native "Stop sharing" bar when sharing screen which has dismiss/stop button.
        // Clicking on the button fires the 'ended' event on the underlying MediaStreamTrack and not by Client or WS.
        // We need to handle this event to tear down the screen share stream.
        if (localTrackPublication.source === Track.Source.ScreenShare && localTrackPublication.track) {
            localTrackPublication.track.mediaStreamTrack.onended = () => {
                this.unshareScreen();
                logDebug('CallClient: local screen share stream teared down by user action on native "Stop sharing" bar');
            };

            // Notify the server that screen sharing has started. We do this here rather than in
            // shareScreen() to guarantee the track is fully published and accessible before the
            // server broadcasts user_screen_on to all participants. This avoids a race where
            // getLocalScreenStream() could return null if called immediately after
            // setScreenShareEnabled() resolves (e.g. when using fake media in E2E tests).
            if (this.websocketClient) {
                this.websocketClient.sendScreenOn({screenStreamID: localTrackPublication.track.mediaStreamTrack?.id ?? ''});
            }
        }

        // LiveKit publishes ScreenShare (video) and ScreenShareAudio as two separate tracks, so this
        // handler fires once per source. When sharing with audio, that means we emit LOCAL_SCREEN_STREAM
        // twice in quick succession:
        // - on ScreenShare publish — composeScreenShareStream returns a stream with just video.
        // - on ScreenShareAudio publish — composeScreenShareStream returns a fresh stream with both
        //      video + audio (it reads the participant's current publications each call).
        if (localTrackPublication.source === Track.Source.ScreenShare || localTrackPublication.source === Track.Source.ScreenShareAudio) {
            const screenShareStream = this.composeScreenShareStream(localParticipant);
            if (screenShareStream) {
                const {userID, sessionID} = this.parseUserIdAndSessionIdFromIdentity(localParticipant);
                this.emit(CALL_EVENT.LOCAL_SCREEN_STREAM, screenShareStream, sessionID, userID);
                logDebug(`CallClient: local screen share stream published for user ${userID}`, localTrackPublication);
            }
        }
    }

    /**
     * Fires when:
     * - our mic track is fully torn down (disconnect, explicit unpublish).
     * - we stop sharing our screen.
     */
    private handleLocalTrackUnpublished(localTrackPublication: LocalTrackPublication, localParticipant: LocalParticipant) {
        const {userID, sessionID} = this.parseUserIdAndSessionIdFromIdentity(localParticipant);

        if (localTrackPublication.source === Track.Source.Microphone) {
            this.emit(CALL_EVENT.MUTE, sessionID, userID);
            logDebug(`CallClient: local voice stream unpublished for user ${userID}`, localTrackPublication);
        }

        if (localTrackPublication.source === Track.Source.ScreenShare) {
            this.emit(CALL_EVENT.LOCAL_SCREEN_STREAM_OFF, sessionID, userID);
            logDebug(`CallClient: local screen share stream unpublished for user ${userID}`, localTrackPublication);
        }
    }

    /**
     * Fires when:
     * - a remote participant publishes a mic track (e.g., they unmute for the first time).
     * - a remote participant publishes a screen-share track.
     */
    private handleRemoteTrackPublished(remoteTrackPublication: RemoteTrackPublication, remoteParticipant: RemoteParticipant) {
        const {userID, sessionID} = this.parseUserIdAndSessionIdFromIdentity(remoteParticipant);

        if (remoteTrackPublication.source === Track.Source.Microphone) {
            this.emit(remoteTrackPublication.isMuted ? CALL_EVENT.MUTE : CALL_EVENT.UNMUTE, sessionID, userID);
            logDebug(`CallClient: remote voice stream published for user ${userID}`, remoteTrackPublication);
        }

        if (remoteTrackPublication.source === Track.Source.ScreenShare || remoteTrackPublication.source === Track.Source.ScreenShareAudio) {
            // Screen-share publications do not carry stream state before subscription:
            // `remoteTrackPublication.track` is undefined here. The actual MediaStreamTrack arrives in
            // handleRemoteTrackSubscribed, which is where we compose and emit REMOTE_SCREEN_STREAM.
            logDebug(`CallClient: remote screen share stream announced (awaiting subscription) for user ${userID}`, remoteTrackPublication);
        }
    }

    /**
     * Fires when
     * - a remote participant's audio bits start flowing to us. We wrap the track in a MediaStream and ship it to the widget for `<audio>` playback.
     * - a remote participant's screen-share bits start flowing to us. We wrap the track in a MediaStream and ship it to the widget for `<video>` playback.
     */
    private handleRemoteTrackSubscribed(remoteTrack: RemoteTrack, _remoteTrackPublication: RemoteTrackPublication, remoteParticipant: RemoteParticipant) {
        const {userID, sessionID} = this.parseUserIdAndSessionIdFromIdentity(remoteParticipant);

        if (remoteTrack.source === Track.Source.Microphone) {
            const stream = new MediaStream([remoteTrack.mediaStreamTrack]);
            this.emit(CALL_EVENT.REMOTE_VOICE_STREAM, stream, sessionID, userID);
            logDebug(`CallClient: remote voice stream subscribed for user ${userID}`, remoteTrack);
        }

        if (remoteTrack.source === Track.Source.ScreenShare || remoteTrack.source === Track.Source.ScreenShareAudio) {
            const screenShareStream = this.composeScreenShareStream(remoteParticipant);
            if (screenShareStream) {
                this.emit(CALL_EVENT.REMOTE_SCREEN_STREAM, screenShareStream, sessionID, userID);
                logDebug(`CallClient: remote screen share stream subscribed for user ${userID}`, remoteTrack);
            }
        }
    }

    /**
     * Fires when -
     * a remote participant tears down their mic track (rare; usually only on leave).
     * a remote participant tears down their screen-share track.
     */
    private handleRemoteTrackUnpublished(remoteTrackPublication: RemoteTrackPublication, remoteParticipant: RemoteParticipant) {
        const {userID, sessionID} = this.parseUserIdAndSessionIdFromIdentity(remoteParticipant);

        if (remoteTrackPublication.source === Track.Source.Microphone) {
            this.emit(CALL_EVENT.MUTE, sessionID, userID);
            logDebug(`CallClient: remote voice stream unpublished for user ${userID}`, remoteTrackPublication);
        }

        if (remoteTrackPublication.source === Track.Source.ScreenShare) {
            this.emit(CALL_EVENT.REMOTE_SCREEN_STREAM_OFF, sessionID, userID);
            logDebug(`CallClient: remote screen share stream unpublished for user ${userID}`, remoteTrackPublication);
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

            logDebug(`CallClient: track muted for user ${userID}`, trackPublication);
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

            logDebug(`CallClient: track unmuted for user ${userID}`, trackPublication);
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

    /**
     * Fires when any participant's attributes change, this includes the local participant as well
     */
    private handleParticipantAttributesChanged(changedAttributes: Participant['attributes'], participant: Participant) {
        if (!participant) {
            return;
        }

        if ((CALL_ATTRIBUTES.RAISED_HAND in changedAttributes)) {
            const {userID, sessionID} = this.parseUserIdAndSessionIdFromIdentity(participant);
            const isHandRaised = changedAttributes[CALL_ATTRIBUTES.RAISED_HAND]?.length > 0;
            if (isHandRaised) {
                this.emit(CALL_EVENT.RAISE_HAND, sessionID, userID, Number(changedAttributes[CALL_ATTRIBUTES.RAISED_HAND]));
            } else {
                this.emit(CALL_EVENT.LOWER_HAND, sessionID, userID);
            }

            logDebug(`CallClient: attributes changed for user ${userID}`, changedAttributes);
        }
    }

    /**
     * Fires when a participant publishes a data message.
     */
    private handleDataReceivedFromParticipant(payload: Uint8Array, participant?: RemoteParticipant, _kind?: number, topic?: string) {
        if (!participant) {
            return;
        }

        if (topic === CALL_MESSAGE_TOPICS.REACTION) {
            const {userID, sessionID} = this.parseUserIdAndSessionIdFromIdentity(participant);
            try {
                const {emojiData, timestamp} = JSON.parse(new TextDecoder().decode(payload)) as ReactionPayload;

                this.emit(CALL_EVENT.REACTION, sessionID, userID, emojiData, timestamp);

                logDebug(`CallClient: reaction received from user ${userID}`, emojiData);
            } catch (err) {
                logErr(`CallClient: reactions received from user ${userID} failed to parse`, err);
            }
        }
    }

    /**
     * Fires when LiveKit encounters an error while attempting to create a media track.
     * It throws for any device error, could be audio, video, or screen share.
     */
    private handleMediaDevicesError(err: Error) {
        if (MediaDeviceFailure.getFailure(err) === MediaDeviceFailure.PermissionDenied) {
            // We already handle this error type in the respective handlers
            return;
        }

        logErr('CallClient: media device error occurred', err);
        this.emit(CALL_EVENT.ERROR, err);
    }

    /**
     * Fires when LiveKit switches the active device for a kind — either because we
     * called switchActiveDevice ourselves, or because LiveKit fell back internally
     * (e.g., system default tracking). Keep our cached currentAudioInputDevice in
     * sync so the picker UI reflects what LiveKit is actually using.
     */
    private handleActiveDeviceChanged(kind: MediaDeviceKind, deviceId: string) {
        if (kind === 'audioinput') {
            const match = this.audioDevices.inputs.find((d) => d.deviceId === deviceId);
            if (match && match.deviceId !== this.currentAudioInputDevice?.deviceId) {
                this.currentAudioInputDevice = match;
                logDebug('CallClient: active audio input device changed by LiveKit', {deviceId: match.deviceId, label: match.label});
                this.emit(CALL_EVENT.DEVICE_CHANGE, this.audioDevices);
            }
        }
    }

    /**
     * Fires whenever LiveKit recomputes who's currently speaking.
     * e.g. N users speaking -> N participants array
     * conversely if no one is speaking -> empty array
     */
    private handleActiveSpeakersChanged(participants: Participant[]) {
        const userIDs: string[] = [];
        const sessionIDs: string[] = [];

        for (const participant of participants) {
            const {userID, sessionID} = this.parseUserIdAndSessionIdFromIdentity(participant);
            sessionIDs.push(sessionID);
            userIDs.push(userID);
        }

        this.emit(CALL_EVENT.USERS_VOICE_ACTIVITY_CHANGED, sessionIDs, userIDs);
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
                logWarn('CallClient: active audio input device removed, falling back to system default',
                    {removed: {deviceId: unplugged.deviceId, label: unplugged.label}, fallback: fallback ? {deviceId: fallback.deviceId, label: fallback.label} : null});
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
                logWarn('CallClient: active audio output device removed, falling back to system default',
                    {removed: {deviceId: unplugged.deviceId, label: unplugged.label}, fallback: fallback ? {deviceId: fallback.deviceId, label: fallback.label} : null});
                if (fallback) {
                    this.setAudioOutputDevice(fallback, false);
                } else {
                    this.currentAudioOutputDevice = null;
                }
                this.emit(CALL_EVENT.DEVICE_FALLBACK, unplugged);
            }
        }

        this.emit(CALL_EVENT.DEVICE_CHANGE, this.audioDevices);
    }

    /**
     * Fires when LiveKit publishes a new ConnectionQuality value for any participant.
     * We only surface the local participant's quality and not the remote participants' quality.
     */
    private handleConnectionQualityChanged(quality: ConnectionQuality, participant: Participant) {
        if (this.room && this.room.localParticipant === participant) {
            this.emit(CALL_EVENT.QUALITY_CHANGED, quality);
        }
    }

    private async fetchJwtTokenAndUrl(channelID: string, sessionID: string): Promise<RtcTokenResponse> {
        const params = new URLSearchParams({channel_id: channelID, session_id: sessionID});
        const url = `${getPluginPath()}/${CALL_TOKEN_API_PATH}?${params.toString()}`;
        return RestClient.fetch<RtcTokenResponse>(url, {method: 'GET'});
    }

    /*
     * Combines video and audio tracks into a single MediaStream from sourceParticipant.
     * Just audio without video is never surfaced.
     */
    private composeScreenShareStream(participant: Participant): MediaStream | null {
        const video = participant.getTrackPublication(Track.Source.ScreenShare)?.track?.mediaStreamTrack;
        if (!video) {
            return null;
        }

        const audio = participant.getTrackPublication(Track.Source.ScreenShareAudio)?.track?.mediaStreamTrack;
        if (!audio) {
            return new MediaStream([video]);
        }

        return new MediaStream([video, audio]);
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

    private async enumerateDevices(): Promise<MediaDevices> {
        try {
            // Room.getLocalDevices wraps navigator.mediaDevices.enumerateDevices
            const [inputs, outputs] = await Promise.all([
                Room.getLocalDevices('audioinput', false),
                Room.getLocalDevices('audiooutput', false),
            ]);
            this.audioDevices = {inputs, outputs};
        } catch (err) {
            logErr('CallClient: enumerating devices failed', err);
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
            logDebug(`CallClient: stored audio ${kind} device not found in current inventory`, {deviceId: stored.deviceId, label: stored.label});
            return null;
        }
        if (matches.length > 1) {
            logDebug(`CallClient: multiple audio ${kind} devices matched stored selection, disambiguating by deviceId`, {deviceId: stored.deviceId, label: stored.label});
            return matches.find((dev) => dev.deviceId === stored.deviceId) ?? null;
        }
        return matches[0];
    }
}
