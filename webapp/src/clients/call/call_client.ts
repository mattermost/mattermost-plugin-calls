// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/* eslint-disable max-lines */

import type {EmojiData} from '@mattermost/calls-common/lib/types';
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
    SubscriptionError,
    Track,
    TrackPublication,
} from 'livekit-client';
import RestClient from 'src/clients/rest';
import {AudioInputPermissionsErr} from 'src/components/error_modal/error_messages';
import {
    STORAGE_CALLS_CLIENT_STATS_KEY,
    STORAGE_CALLS_DEFAULT_AUDIO_INPUT_KEY,
    STORAGE_CALLS_DEFAULT_AUDIO_OUTPUT_KEY,
} from 'src/constants';
import {flushLogsToAccumulated, logDebug, logErr, logInfo, logWarn} from 'src/log';
import {parseRTCStats} from 'src/rtc_stats';
import {CallsClientStats, MediaDevices, ShareScreenError, ShareScreenResult, TrackMetadata} from 'src/types/types';
import {getPersistentStorage, getPluginPath, getScreenStream} from 'src/utils';

import {
    AUDIO_CAPTURE_DEFAULTS,
    CALL_ATTRIBUTES,
    CALL_EVENT,
    CALL_MESSAGE_TOPICS,
    CALL_TOKEN_API_PATH,
    HOST_CONTROL_ACTIONS,
    TRACK_PUBLISHING_DEFAULTS,
    USER_ID_SESSION_ID_SEPARATOR,
} from './constants';
import {
    CallRoomMetadata,
    ConnectPayload,
    HostControlPayload,
    LiveKitSessionResponse,
    ReactionPayload,
    ScreenSharingSession,
} from './types';

// trackMetadata extracts the diagnostic fields getStats() reports for a track,
// from its underlying MediaStreamTrack. Mirrors the shape produced by the legacy
// pion client so the --- Call Stats --- block looks the same on both paths.
function trackMetadata(track: LocalTrack | RemoteTrack): TrackMetadata {
    const mst = track.mediaStreamTrack;
    return {
        streamID: track.mediaStream?.id ?? '',
        id: mst.id,
        kind: mst.kind,
        label: mst.label,
        enabled: mst.enabled,
        readyState: mst.readyState,
    };
}

// mergeStatsReports flattens the per-track RTCStatsReports returned by the
// LiveKit SDK into a single map keyed by stat id. RTCRtpSender/Receiver.getStats()
// each return the full chain for their RTP stream — including the shared
// transport and candidate-pair entries — so the same candidate-pair id appears
// in every report on a given PeerConnection; keying by id dedupes those while
// preserving the distinct publisher/subscriber transports. The result is a
// Map, which satisfies RTCStatsReport (a ReadonlyMap) for parseRTCStats().
function mergeStatsReports(reports: RTCStatsReport[]): RTCStatsReport {
    // RTCStatsReport is a ReadonlyMap<string, any>; the per-stat value type is
    // inherently any (it varies by stat type), matching the DOM lib definition.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const merged = new Map<string, any>();
    for (const report of reports) {
        report.forEach((stat, id) => {
            merged.set(id, stat);
        });
    }
    return merged;
}

// How often we sample RTC stats during a live call, so a last-known-good sample
// is available to log if the call is torn down remotely. Matches the v1 client's
// RTCMonitor cadence.
const statsPollIntervalMs = 10000;

export default class CallClient extends EventEmitter {
    public channelID = '';
    public initTime = 0;
    public currentAudioInputDevice: MediaDeviceInfo | null = null;
    public currentAudioOutputDevice: MediaDeviceInfo | null = null;

    private room: Room | null = null;
    private roomConnected = false;
    private disconnecting = false;
    private disconnected = false;
    private connectPayload: ConnectPayload | null = null;

    // Server-minted session id from the join request. Held here rather than read
    // back off the LiveKit identity so it is available before the room connects.
    private sessionID = '';

    // The screen sharer last emitted, so a recompute that changes nothing stays
    // silent instead of handing consumers a fresh MediaStream to re-attach.
    private screenSharingSessionID: string | null = null;
    private screenShareTrackSIDs = '';

    // Most recent periodic stats sample, captured while the call is live. On a
    // remote-initiated teardown (host ends the call, network drop) the peer
    // connections are already gone by the time we learn about it, so this is the
    // best stats we can log for forensics. See startStatsPolling().
    private lastStats: CallsClientStats | null = null;
    private statsPollTimer: ReturnType<typeof setInterval> | null = null;

    // Mutex for ensureMicrophoneTrack — set synchronously before the first await so
    // concurrent callers are blocked immediately.
    private micTrackEnsureInProgress = false;

    // Cached enumerated audio devices so we can call getAudioDevices() synchronously
    private audioDevices: MediaDevices = {inputs: [], outputs: []};

    constructor() {
        super();

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
        room.on(RoomEvent.TrackUnsubscribed, this.handleRemoteTrackUnsubscribed.bind(this));
        room.on(RoomEvent.TrackUnpublished, this.handleRemoteTrackUnpublished.bind(this));
        room.on(RoomEvent.TrackMuted, this.handleTrackMuted.bind(this));
        room.on(RoomEvent.TrackUnmuted, this.handleTrackUnmuted.bind(this));
        room.on(RoomEvent.ParticipantConnected, this.handleParticipantConnected.bind(this));
        room.on(RoomEvent.ParticipantDisconnected, this.handleParticipantDisconnected.bind(this));
        room.on(RoomEvent.ParticipantAttributesChanged, this.handleParticipantAttributesChanged.bind(this));
        room.on(RoomEvent.RoomMetadataChanged, this.handleRoomMetadataChanged.bind(this));
        room.on(RoomEvent.ActiveSpeakersChanged, this.handleActiveSpeakersChanged.bind(this));
        room.on(RoomEvent.DataReceived, this.handleDataReceivedFromParticipant.bind(this));
        room.on(RoomEvent.MediaDevicesChanged, this.handleMediaDevicesChanged.bind(this));
        room.on(RoomEvent.MediaDevicesError, this.handleMediaDevicesError.bind(this));
        room.on(RoomEvent.ActiveDeviceChanged, this.handleActiveDeviceChanged.bind(this));
        room.on(RoomEvent.ConnectionQualityChanged, this.handleConnectionQualityChanged.bind(this));
        room.on(RoomEvent.TrackSubscriptionFailed, this.handleTrackSubscriptionFailed.bind(this));
        room.on(RoomEvent.EncryptionError, this.handleEncryptionError.bind(this));
    }

    // trackPubSummary returns a compact, log-friendly view of a track publication.
    // We deliberately avoid logging the raw LiveKit publication object: it serializes
    // to several KB (EventEmitter internals, logger config, full trackInfo/options),
    // which floods the client log buffer. Media-performance fields (bitrate, bytes,
    // jitter) are intentionally omitted — those belong to the RTC stats report.
    // Remote publications also carry subscription/permission state, which has no
    // local equivalent and is not surfaced by getStats().
    private trackPubSummary(pub: TrackPublication) {
        const summary: Record<string, unknown> = {
            sid: pub.trackSid,
            source: pub.source,
            kind: pub.kind,
            muted: pub.isMuted,
            mimeType: pub.mimeType,
        };
        if (pub instanceof RemoteTrackPublication) {
            summary.subscribed = pub.isSubscribed;
            summary.permission = pub.permissionStatus;
        }
        return summary;
    }

    // trackSummary is the equivalent compact view for a subscribed remote track.
    private trackSummary(track: RemoteTrack) {
        return {
            sid: track.sid,
            source: track.source,
            kind: track.kind,
            streamState: track.streamState,
        };
    }

    // True while the LiveKit room is connected and we haven't torn down. Note this
    // reflects the media plane only; the call state snapshot arrives from the join
    // request before this flips, and host/job state follows over room metadata.
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

    public async connect(connectPayload: ConnectPayload): Promise<void> {
        if (this.roomConnected) {
            throw new Error('CallClient: room already connected');
        }

        if (!this.room) {
            throw new Error('CallClient: room not initialized');
        }

        this.connectPayload = connectPayload;
        this.channelID = connectPayload.channelID;

        let token: string;
        let url: string;
        try {
            // One round trip mints the session, creates the call if we are the
            // first joiner, and returns the state snapshot. The session id comes
            // from the server rather than from a WebSocket connection, which is
            // what lets us join with no Calls WebSocket at all.
            const response = await this.createSession(connectPayload);
            token = response.token;
            url = response.url;
            this.sessionID = response.session_id;

            if (!token || !url || !this.sessionID) {
                throw new Error('CallClient: incomplete session response from join API');
            }

            logDebug('CallClient: session created', {url, sessionID: this.sessionID});

            // Emitted before the room connects, so consumers seed their store
            // ahead of any LiveKit-sourced state.
            if (response.call_state) {
                this.emit(CALL_EVENT.CALL_STATE, response.call_state);
            }
        } catch (err) {
            // If the user cancelled the network request before it connected, we will have already teared down
            if (this.disconnecting) {
                logDebug('CallClient: connect aborted by concurrent disconnect (during session create)');
                return;
            }

            logErr('CallClient: session create error', err);
            this.connectPayload = null;

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

            // The session row was created by the join request but never confirmed,
            // since LiveKit has no participant to report. It stays invisible to the
            // channel and is reaped by the reconciliation sweep (MM-69510).
            this.emit(CALL_EVENT.ERROR, err);
            throw err;
        }
    }

    // The single public entry point to end a call. In the normal case it ONLY
    // initiates a LiveKit disconnect and does no teardown itself; all teardown —
    // including the final stats/log flush — is driven by the resulting
    // RoomEvent.Disconnected -> handleDisconnected().
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
            // room.disconnect() will not emit the event in this state, so run
            // handleDisconnected directly to ensure teardown still occurs.
            this.handleDisconnected(DisconnectReason.CLIENT_INITIATED);
        }

        return isDisconnectCompleted;
    }

    // startStatsPolling samples RTC stats on an interval while the call is live,
    // keeping the latest in lastStats. This is the sole stats source flushed at
    // teardown: by the time we learn a call ended (especially a remote teardown)
    // the peer connections are gone, so a fresh read is not possible.
    private startStatsPolling(): void {
        this.stopStatsPolling();

        // Take an immediate sample rather than waiting a full interval, so a call
        // that fails early still has stats — in particular the ICE candidate pairs,
        // which are the key diagnostic for a connection that never stabilized.
        void this.pollStats();

        this.statsPollTimer = setInterval(this.pollStats, statsPollIntervalMs);
    }

    private stopStatsPolling(): void {
        if (this.statsPollTimer) {
            clearInterval(this.statsPollTimer);
            this.statsPollTimer = null;
        }
    }

    // pollStats captures one stats sample into lastStats. Arrow-bound so it can be
    // handed directly to setInterval. Failures are logged at debug and swallowed —
    // a transient read failure just means we keep the previous sample.
    private pollStats = async (): Promise<void> => {
        try {
            const stats = await this.getStats();
            if (stats) {
                this.lastStats = stats;
            }
        } catch (err) {
            logDebug('CallClient: periodic stats capture failed', err);
        }
    };

    public isMicTrackPublished(): boolean {
        return Boolean(this.room?.localParticipant.getTrackPublication(Track.Source.Microphone));
    }

    public async mute(): Promise<void> {
        const pub = this.room?.localParticipant.getTrackPublication(Track.Source.Microphone);
        if (!pub) {
            logWarn('CallClient: mute called with no mic track published');
            return;
        }
        try {
            await pub.mute();
        } catch (err) {
            logErr('CallClient: muting microphone failed', err);
        }
    }

    public async unmute(): Promise<void> {
        const pub = this.room?.localParticipant.getTrackPublication(Track.Source.Microphone);
        if (!pub) {
            logWarn('CallClient: unmute called with no mic track published');
            return;
        }
        try {
            await pub.unmute();
        } catch (err) {
            logErr('CallClient: unmuting microphone failed', err);
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

    public async shareScreen(sourceID?: string, withAudio?: boolean): Promise<ShareScreenResult> {
        const fail = (reason: ShareScreenError): ShareScreenResult => [null, reason];

        if (!this.room || !this.roomConnected) {
            return fail('not-connected');
        }

        // If we're already sharing, return the existing stream.
        if (this.room.localParticipant.getTrackPublication(Track.Source.ScreenShare)) {
            logDebug('CallClient: you are already sharing screen');
            const stream = this.getLocalScreenStream();
            if (stream) {
                return [stream, null];
            }
            return fail('capture-error');
        }

        // If another participant is already sharing, report it distinctly so callers can show a
        // targeted notice rather than the generic permission-denied error.
        if (this.remoteScreenSharerExists()) {
            logDebug('CallClient: another participant is already sharing screen');
            return fail('already-sharing');
        }

        try {
            const shareErr = window.desktop ?
                await this.shareScreenInDesktop(sourceID, withAudio) :
                await this.shareScreenInBrowser(withAudio);
            if (shareErr) {
                return fail(shareErr);
            }

            const stream = this.getLocalScreenStream();
            logDebug('CallClient: screen share stream started', {sourceID, withAudio, streamID: stream?.id});
            if (stream) {
                return [stream, null];
            }
            return fail('capture-error');
        } catch (err) {
            if (MediaDeviceFailure.getFailure(err) === MediaDeviceFailure.PermissionDenied) {
                logDebug('CallClient: screen share was either cancelled or permissions were denied');
                return fail('permission-denied');
            }
            logErr('CallClient: sharing screen failed', err);
            this.emit(CALL_EVENT.ERROR, err);
            return fail('capture-error');
        }
    }

    // shareScreenWithStream publishes an already-captured screen stream. Use this when
    // getDisplayMedia was called in the focused window (e.g. the popout) and the stream
    // needs to be published to the room that lives in the opener.
    // Firefox blocks getDisplayMedia in an unfocused window; the caller captures in the
    // focused popout and delegates the publish step here.
    public async shareScreenWithStream(stream: MediaStream): Promise<boolean> {
        if (!this.room || !this.roomConnected) {
            stream.getTracks().forEach((t) => t.stop());
            return false;
        }

        // Bail if we're already sharing to avoid publishing a duplicate ScreenShare track.
        if (this.room.localParticipant.getTrackPublication(Track.Source.ScreenShare)) {
            stream.getTracks().forEach((t) => t.stop());
            return false;
        }

        const tracks: LocalTrack[] = [];
        const [videoTrack] = stream.getVideoTracks();
        if (videoTrack) {
            const screenVideo = new LocalVideoTrack(videoTrack, undefined, false);
            screenVideo.source = Track.Source.ScreenShare;
            tracks.push(screenVideo);
        }
        const [audioTrack] = stream.getAudioTracks();
        if (audioTrack) {
            const screenAudio = new LocalAudioTrack(audioTrack, undefined, false);
            screenAudio.source = Track.Source.ScreenShareAudio;
            tracks.push(screenAudio);
        }

        try {
            // The stream was captured in the popout, so the picker has already been
            // through; publishScreenTracks does the competing-share check.
            if (await this.publishScreenTracks(tracks)) {
                stream.getTracks().forEach((t) => t.stop());
                return false;
            }

            logDebug('CallClient: shareScreenWithStream published', {streamID: stream.id});
            return true;
        } catch (err) {
            // The caller captured this stream and handed it over, so releasing it is
            // ours to do — and it is not necessarily the same set of tracks we
            // wrapped for publishing.
            stream.getTracks().forEach((t) => t.stop());
            logErr('CallClient: shareScreenWithStream failed', err);
            this.emit(CALL_EVENT.ERROR, err);
            return false;
        }
    }

    // shareScreenInBrowser captures the screen and publishes it, re-checking for a
    // competing share in between.
    //
    // setScreenShareEnabled() would be shorter, but it opens the picker and
    // publishes in one step, leaving no seam to check in. The user can sit in the
    // picker for seconds, which is easily long enough for someone else to start
    // sharing — so the check has to happen after the picker resolves, immediately
    // before publishing. createScreenTracks() captures without publishing, which
    // gives us that seam.
    private async shareScreenInBrowser(withAudio?: boolean): Promise<ShareScreenError | null> {
        if (!this.room) {
            return 'capture-error';
        }

        // Only hint systemAudio when audio capture is actually requested.
        const captureOptions: ScreenShareCaptureOptions = {audio: Boolean(withAudio)};
        if (withAudio) {
            captureOptions.systemAudio = 'include';
        }

        const tracks = await this.room.localParticipant.createScreenTracks(captureOptions);
        if (tracks.length === 0) {
            return 'capture-error';
        }

        return this.publishScreenTracks(tracks);
    }

    // shareScreenInDesktop captures and publishes the source already chosen via
    // Electron's desktopCapturer picker. LiveKit's setScreenShareEnabled() would
    // call getDisplayMedia() and ignore the chosen sourceID, so we capture that
    // specific source ourselves (getScreenStream uses getUserMedia +
    // chromeMediaSourceId) and publish the tracks tagged as ScreenShare,
    // mirroring LiveKit's own createScreenTracks().
    private async shareScreenInDesktop(sourceID?: string, withAudio?: boolean): Promise<ShareScreenError | null> {
        if (!this.room) {
            return 'capture-error';
        }

        const screenStream = await getScreenStream(sourceID, withAudio);
        if (!screenStream) {
            return 'capture-error';
        }

        const tracks: LocalTrack[] = [];
        const [videoTrack] = screenStream.getVideoTracks();
        if (videoTrack) {
            const screenVideo = new LocalVideoTrack(videoTrack, undefined, false);
            screenVideo.source = Track.Source.ScreenShare;
            tracks.push(screenVideo);
        }
        const [audioTrack] = screenStream.getAudioTracks();
        if (audioTrack) {
            const screenAudio = new LocalAudioTrack(audioTrack, undefined, false);
            screenAudio.source = Track.Source.ScreenShareAudio;
            tracks.push(screenAudio);
        }

        return this.publishScreenTracks(tracks);
    }

    // publishScreenTracks publishes already-captured screen tracks, bailing if
    // someone else started sharing while we were capturing.
    //
    // Re-checking here rather than only before capture is what collapses the
    // double-share window from the user's entire picker time down to SFU
    // propagation. The server arbitrates whatever still slips through.
    private async publishScreenTracks(tracks: LocalTrack[]): Promise<ShareScreenError | null> {
        const stopAll = () => tracks.forEach((track) => track.stop());

        if (!this.room || !this.roomConnected) {
            stopAll();
            return 'not-connected';
        }

        if (this.remoteScreenSharerExists()) {
            logDebug('CallClient: another participant started sharing while we were capturing');
            stopAll();
            return 'already-sharing';
        }

        const published: LocalTrack[] = [];
        try {
            // Sequential, so the video publication lands before its audio: consumers
            // key the share on the video track and treat audio as an addition to it.
            await tracks.reduce(
                (chain, track) => chain.then(async () => {
                    await this.room!.localParticipant.publishTrack(track);
                    published.push(track);
                }),
                Promise.resolve(),
            );
            return null;
        } catch (err) {
            // Roll back any partial publishes so we don't leave a live ScreenShare
            // track behind, which would desync us from LiveKit. Use allSettled so a
            // teardown failure can't mask the original publish error, which is what
            // we actually want to surface.
            await Promise.allSettled(published.map((track) => this.room!.localParticipant.unpublishTrack(track, true)));
            stopAll();
            throw err;
        }
    }

    // Whether any remote participant holds a live screen-share publication.
    private remoteScreenSharerExists(): boolean {
        if (!this.room) {
            return false;
        }

        for (const remoteParticipant of this.room.remoteParticipants.values()) {
            if (remoteParticipant.getTrackPublication(Track.Source.ScreenShare)) {
                return true;
            }
        }
        return false;
    }

    public async unshareScreen(): Promise<void> {
        if (!this.room || !this.roomConnected) {
            return;
        }

        try {
            // handleLocalTrackUnpublished fires and recomputes the screen sharer.
            // The server learns about it from the track_unpublished webhook, so
            // there is nothing to tell it here.
            await this.room.localParticipant.setScreenShareEnabled(false);
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
        if (!this.room) {
            return null;
        }

        const tracksInfo: TrackMetadata[] = [];
        const reports: RTCStatsReport[] = [];

        const collect = async (track: LocalTrack | RemoteTrack) => {
            tracksInfo.push(trackMetadata(track));
            try {
                const report = await track.getRTCStatsReport();
                if (report) {
                    reports.push(report);
                }
            } catch (err) {
                logWarn(`CallClient: failed to get RTC stats for track ${track.sid} (${track.source})`, err);
            }
        };

        // Our published tracks (microphone, screen video/audio).
        const collecting: Promise<void>[] = [];
        for (const pub of this.room.localParticipant.trackPublications.values()) {
            if (pub.track) {
                collecting.push(collect(pub.track));
            }
        }

        // Tracks we're subscribed to from remote participants.
        for (const participant of this.room.remoteParticipants.values()) {
            for (const pub of participant.trackPublications.values()) {
                if (pub.track) {
                    collecting.push(collect(pub.track));
                }
            }
        }

        await Promise.all(collecting);

        return {
            initTime: this.initTime,
            channelID: this.channelID,
            tracksInfo,
            rtcStats: reports.length ? parseRTCStats(mergeStatsReports(reports)) : null,
        };
    }

    // Server-minted at join and stable for the lifetime of the client, so it
    // survives both a LiveKit reconnect and the room being released at teardown.
    public getSessionID() {
        return this.sessionID || null;
    }

    // The session currently presenting a screen share, or null if nobody is.
    // Derived from LiveKit track state, so every client agrees on it.
    public getCurrentScreenSharingSessionID(): string | null {
        return this.screenSharingSessionID;
    }

    // ------------------------------------------------------------
    // Private methods
    // ------------------------------------------------------------

    private handleConnected() {
        if (!this.room) {
            return;
        }

        this.roomConnected = true;
        this.initTime = Date.now();

        // Start sampling RTC stats so we have a last-known-good snapshot to log if
        // the call is torn down remotely (see lastStats / startStatsPolling).
        this.startStatsPolling();

        // Capture and publish the mic track in the background so connection
        // handling is not blocked by the user's interaction.
        void this.ensureMicrophoneTrack();

        // Seed the initial state for everyone already in the room (local + remote):
        // USER_JOINED creates the session, then the LiveKit-owned fields (mic mute +
        // raised hand) are layered on top.
        const localParticipant = this.room.localParticipant;
        const {userID: localUserId, sessionID: localSessionID} = this.parseUserIdAndSessionIdFromIdentity(localParticipant);
        this.emit(CALL_EVENT.USER_JOINED, localSessionID, localUserId, true);
        this.emitLiveKitOwnedState(localParticipant);

        for (const remoteParticipant of this.room.remoteParticipants.values()) {
            // The bot is not a call participant; keep it out of the list.
            if (this.isBotParticipant(remoteParticipant)) {
                continue;
            }
            const {userID: remoteUserId, sessionID: remoteSessionID} = this.parseUserIdAndSessionIdFromIdentity(remoteParticipant);
            this.emit(CALL_EVENT.USER_JOINED, remoteSessionID, remoteUserId, true);
            this.emitLiveKitOwnedState(remoteParticipant);
        }

        // Room metadata is delivered on connect, so the current host and job state
        // are already on the room object. Applying it here is what makes metadata
        // need no companion resync path.
        this.emitRoomMetadata(this.room.metadata);

        // The screen share, likewise: a share already in progress has its track
        // published, so derive from that rather than waiting for an event that
        // has already fired.
        this.emitScreenSharingSession();

        logDebug(`CallClient: connected and seeded initial state for ${this.room.remoteParticipants.size + 1} participant(s)`);
        this.emit(CALL_EVENT.CONNECTED);
    }

    /**
     * Fires when the server publishes new room metadata, which carries the
     * call-level state LiveKit cannot supply: who the host is and whether a job
     * is running.
     */
    private handleRoomMetadataChanged(metadata: string) {
        this.emitRoomMetadata(metadata);
    }

    private emitRoomMetadata(metadata?: string) {
        if (!metadata) {
            return;
        }

        let parsed: CallRoomMetadata;
        try {
            parsed = JSON.parse(metadata) as CallRoomMetadata;
        } catch (err) {
            logErr('CallClient: failed to parse room metadata', err, 'metadata:', metadata);
            return;
        }

        if (parsed.host_id) {
            this.emit(CALL_EVENT.HOST_CHANGED, parsed.host_id);
        }

        // Each job is emitted separately: consumers key their store on the job
        // type, which is carried inside the job state itself.
        for (const job of [parsed.recording, parsed.transcription, parsed.live_captions]) {
            if (job) {
                this.emit(CALL_EVENT.JOB_STATE, job);
            }
        }

        logDebug('CallClient: room metadata applied', parsed);
    }

    /**
     * Emits the LiveKit-owned per-participant state — mic mute and raised hand —
     * that the server does not track. Layered on top of an already-created
     * session; does NOT emit USER_JOINED.
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

    // Requests microphone permission via getUserMedia, then pre-publishes the captured
    // track to LiveKit in a muted state. Pre-publishing means subsequent mute/unmute
    // operations only require a LiveKit signal — no new getUserMedia call — which is
    // critical for Firefox, where getUserMedia is blocked in unfocused windows such as
    // the popout. The main window is always focused at join time, so capture is safe here.
    // Idempotent: skips publication if a mic track is already published (e.g. on hot-plug).
    private async ensureMicrophoneTrack() {
        if (this.micTrackEnsureInProgress) {
            logDebug('CallClient: ensureMicrophoneTrack already in progress, skipping');
            return;
        }
        this.micTrackEnsureInProgress = true;
        let notFound = false;
        try {
            logDebug('CallClient: ensuring microphone track');
            const mediaStream = await navigator.mediaDevices.getUserMedia({audio: true});

            const audioTrack = mediaStream.getTracks()[0];
            if (audioTrack && this.room &&
                !this.room.localParticipant.getTrackPublication(Track.Source.Microphone)) {
                const localAudioTrack = new LocalAudioTrack(audioTrack, undefined, false);
                localAudioTrack.source = Track.Source.Microphone;
                try {
                    await this.room.localParticipant.publishTrack(localAudioTrack);

                    // publishTrack always publishes as unmuted; call pub.mute() to set
                    // LiveKit's signaling state so the UI and remote participants see muted.
                    await this.mute();
                    logDebug('CallClient: pre-published muted mic track');
                } catch (publishErr) {
                    audioTrack.stop();
                    logErr('CallClient: failed to pre-publish muted mic track', publishErr);
                }
            } else if (audioTrack) {
                audioTrack.stop();
            }

            logDebug('CallClient: microphone permission granted');

            // enumerateDevices() returns devices with empty labels
            // until getUserMedia has resolved successfully.
            await this.enumerateDevices();

            // Restore the user's last-selected device now that the inventory
            // has real labels and deviceIds. Matching against the pre-grant
            // stub list would either miss the entry or pin a phantom
            // "default" deviceId that no longer maps to anything.
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
            } else if (MediaDeviceFailure.getFailure(err) === MediaDeviceFailure.NotFound) {
                logDebug('CallClient: no audio input device found');
                notFound = true;
            } else {
                logErr('CallClient: failed to request microphone permission', err);
                this.emit(CALL_EVENT.ERROR, err);
            }
        } finally {
            this.micTrackEnsureInProgress = false;
        }

        if (notFound) {
            // Enumerate and emit outside the micTrackEnsureInProgress mutex so a concurrent
            // MediaDevicesChanged (e.g. user plugs in a mic immediately after joining) is not blocked.
            // DEVICE_CHANGE triggers the missing-audio-input alert in the UI.
            await this.enumerateDevices();
            this.emit(CALL_EVENT.DEVICE_CHANGE, this.audioDevices);
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

        this.stopStatsPolling();

        this.emit(CALL_EVENT.DISCONNECTED, reason);

        // Sever our EventEmitter listeners from the room before releasing the reference.
        // LiveKit's internal devicechange listener uses a WeakRef/AbortController pattern
        // that defeats its own removeEventListener, so the native OS event keeps reaching
        // the Room and re-emitting MediaDevicesChanged long after the call ends. Calling
        // removeAllListeners() here ensures our handleMediaDevicesChanged (→ enumerateDevices
        // → log) stops firing even while the Room object awaits GC.
        const room = this.room;
        this.room = null;
        room?.removeAllListeners();

        // Persist final diagnostics: the last periodic stats sample (lastStats is
        // null for a call torn down within the first poll interval) folded into the
        // log buffer that `/call logs` uploads, plus a copy under
        // STORAGE_CALLS_CLIENT_STATS_KEY for `/call stats`, mirroring the v1 client.
        // When this call captured no sample, clear the key so `/call stats` shows
        // empty rather than leaking a previous call's stats.
        flushLogsToAccumulated(this.lastStats);
        if (this.lastStats) {
            getPersistentStorage().setItem(STORAGE_CALLS_CLIENT_STATS_KEY, JSON.stringify(this.lastStats));
        } else {
            getPersistentStorage().removeItem(STORAGE_CALLS_CLIENT_STATS_KEY);
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

            const micPubs = Array.from(localParticipant.audioTrackPublications.values()).filter(
                (p) => p.source === Track.Source.Microphone,
            );
            if (micPubs.length > 1) {
                logWarn('CallClient: multiple mic tracks published — mute control may be unreliable',
                    micPubs.map((p) => this.trackPubSummary(p)));
            }

            logDebug(`CallClient: local voice stream published for user ${userID}`, this.trackPubSummary(localTrackPublication));

            // The mic is usually the first track on the transport, so sample now to
            // capture ICE candidate pairs as soon as they exist (see startStatsPolling).
            void this.pollStats();
        }

        // Browser renders a native "Stop sharing" bar when sharing screen which has dismiss/stop button.
        // Clicking on the button fires the 'ended' event on the underlying MediaStreamTrack and not by Client or WS.
        // We need to handle this event to tear down the screen share stream.
        if (localTrackPublication.source === Track.Source.ScreenShare && localTrackPublication.track) {
            localTrackPublication.track.mediaStreamTrack.onended = () => {
                this.unshareScreen();
                logDebug('CallClient: local screen share stream teared down by user action on native "Stop sharing" bar');
            };
        }

        // LiveKit publishes ScreenShare and ScreenShareAudio as two separate tracks,
        // so this fires once per source and the composed stream legitimately changes
        // shortly after the video first appears.
        if (localTrackPublication.source === Track.Source.ScreenShare || localTrackPublication.source === Track.Source.ScreenShareAudio) {
            logDebug('CallClient: local screen share track published', this.trackPubSummary(localTrackPublication));
            this.emitScreenSharingSession();
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
            logDebug(`CallClient: local voice stream unpublished for user ${userID}`, this.trackPubSummary(localTrackPublication));
        }

        if (localTrackPublication.source === Track.Source.ScreenShare) {
            logDebug(`CallClient: local screen share stream unpublished for user ${userID}`, this.trackPubSummary(localTrackPublication));
            this.emitScreenSharingSession();
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
            logDebug(`CallClient: remote voice stream published for user ${userID}`, this.trackPubSummary(remoteTrackPublication));
        }

        if (remoteTrackPublication.source === Track.Source.ScreenShare || remoteTrackPublication.source === Track.Source.ScreenShareAudio) {
            // Screen-share publications do not carry stream state before subscription:
            // `remoteTrackPublication.track` is undefined here, so the recompute names
            // the sharer with a null stream and the follow-up on subscription fills it in.
            logDebug(`CallClient: remote screen share stream announced (awaiting subscription) for user ${userID}`, this.trackPubSummary(remoteTrackPublication));
            this.emitScreenSharingSession();
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
            logDebug(`CallClient: remote voice stream subscribed for user ${userID}`, this.trackSummary(remoteTrack));
        }

        if (remoteTrack.source === Track.Source.ScreenShare || remoteTrack.source === Track.Source.ScreenShareAudio) {
            logDebug(`CallClient: remote screen share stream subscribed for user ${userID}`, this.trackSummary(remoteTrack));
            this.emitScreenSharingSession();
        }
    }

    /**
     * Fires when a remote track we were subscribed to goes away without the
     * publication being removed. Folded into the same recompute so the derived
     * sharer never outlives the media.
     */
    private handleRemoteTrackUnsubscribed(remoteTrack: RemoteTrack, _remoteTrackPublication: RemoteTrackPublication, remoteParticipant: RemoteParticipant) {
        if (remoteTrack.source === Track.Source.ScreenShare || remoteTrack.source === Track.Source.ScreenShareAudio) {
            const {userID} = this.parseUserIdAndSessionIdFromIdentity(remoteParticipant);
            logDebug(`CallClient: remote screen share stream unsubscribed for user ${userID}`, this.trackSummary(remoteTrack));
            this.emitScreenSharingSession();
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
            logDebug(`CallClient: remote voice stream unpublished for user ${userID}`, this.trackPubSummary(remoteTrackPublication));
        }

        if (remoteTrackPublication.source === Track.Source.ScreenShare) {
            logDebug(`CallClient: remote screen share stream unpublished for user ${userID}`, this.trackPubSummary(remoteTrackPublication));
            this.emitScreenSharingSession();
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

            logDebug(`CallClient: track muted for user ${userID}`, this.trackPubSummary(trackPublication));
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

            logDebug(`CallClient: track unmuted for user ${userID}`, this.trackPubSummary(trackPublication));
        }
    }

    /**
     * Fires when a remote participant joins the room (after we have already connected).
     * Emits USER_JOINED so the dispatcher can populate Redux + play the join sound.
     */
    private handleParticipantConnected(remoteParticipant: RemoteParticipant) {
        // The bot is not a call participant; keep it out of the list.
        if (this.isBotParticipant(remoteParticipant)) {
            return;
        }
        const {userID, sessionID} = this.parseUserIdAndSessionIdFromIdentity(remoteParticipant);
        this.emit(CALL_EVENT.USER_JOINED, sessionID, userID);

        logDebug(`CallClient: participant connected ${userID}`);
    }

    /**
     * Fires when a remote participant leaves the room.
     * Emits USER_LEFT so the dispatcher can drop the session from Redux.
     */
    private handleParticipantDisconnected(remoteParticipant: RemoteParticipant) {
        // The bot was never added to the list (see handleParticipantConnected),
        // so don't emit USER_LEFT for it.
        if (this.isBotParticipant(remoteParticipant)) {
            return;
        }
        const {userID, sessionID} = this.parseUserIdAndSessionIdFromIdentity(remoteParticipant);
        this.emit(CALL_EVENT.USER_LEFT, sessionID, userID);

        logDebug(`CallClient: participant disconnected ${userID}`);

        // A disconnect removes the participant's publications without firing
        // trackUnpublished, so a sharer leaving is only visible here.
        this.emitScreenSharingSession();
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
        if (topic === CALL_MESSAGE_TOPICS.HOST_CONTROL) {
            // Sent by the server through the admin API, so there is deliberately
            // no sending participant here.
            this.handleHostControl(payload);
            return;
        }

        // Everything below is participant-to-participant.
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
     * Carries out a host command the server cannot enforce itself. Stopping a
     * screen share is the only one: muting the track would leave the capture
     * running and the browser's sharing indicator lit, so the client has to tear
     * it down. Once it does, the track_unpublished webhook clears server state.
     */
    private handleHostControl(payload: Uint8Array) {
        let action: string;
        try {
            ({action} = JSON.parse(new TextDecoder().decode(payload)) as HostControlPayload);
        } catch (err) {
            logErr('CallClient: host control message failed to parse', err);
            return;
        }

        logDebug('CallClient: host control message received', action);

        switch (action) {
        case HOST_CONTROL_ACTIONS.STOP_SCREENSHARE:
            void this.unshareScreen();
            break;
        default:
            logWarn('CallClient: unhandled host control action', action);
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

    // Fires when the SDK fails to subscribe to a remote track — the media-layer
    // cause behind "I can't hear/see someone". Logged for forensics; LiveKit
    // retries subscription on its own, so we don't surface it to the user.
    private handleTrackSubscriptionFailed(trackSid: string, participant: RemoteParticipant, reason?: SubscriptionError) {
        const {userID, sessionID} = this.parseUserIdAndSessionIdFromIdentity(participant);
        const reasonName = reason === undefined ? 'unknown' : SubscriptionError[reason];
        logErr(`CallClient: track subscription failed for track ${trackSid} from user ${userID} (session ${sessionID}), reason: ${reasonName}`);
    }

    // Fires on an E2EE failure. Calls does not enable end-to-end encryption today,
    // so this should not occur — logged defensively in case it ever does.
    private handleEncryptionError(err: Error, participant?: Participant) {
        const who = participant ? ` for user ${this.parseUserIdAndSessionIdFromIdentity(participant).userID}` : '';
        logErr(`CallClient: encryption error${who}`, err);
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
        const prevInputCount = this.audioDevices.inputs.length;
        await this.enumerateDevices();

        // If the first mic appeared and no track is published yet, capture and publish
        // from the main window so Firefox popout unmute has no getUserMedia race.
        if (prevInputCount === 0 && this.audioDevices.inputs.length > 0 &&
            !this.room?.localParticipant.getTrackPublication(Track.Source.Microphone)) {
            void this.ensureMicrophoneTrack();
        }

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

    private async createSession(connectPayload: ConnectPayload): Promise<LiveKitSessionResponse> {
        return RestClient.fetch<LiveKitSessionResponse>(
            `${getPluginPath()}/${CALL_TOKEN_API_PATH}`,
            {
                method: 'POST',
                body: JSON.stringify({
                    channel_id: connectPayload.channelID,
                    title: connectPayload.title,
                    thread_id: connectPayload.threadID,
                    job_id: connectPayload.jobID,
                }),
            },
        );
    }

    /**
     * Recomputes which screen share is being presented and emits it if anything
     * changed.
     *
     * Derived on every screen event rather than assigned by each event, because
     * screen events are unordered and can be dropped or duplicated. Assigning the
     * slot from whichever event arrived last meant two simultaneous shares left
     * viewers rendering different screens, and one sharer stopping blanked
     * everyone watching the other. Recomputing from scratch is idempotent,
     * order-independent and self-healing.
     *
     * When two participants do share at once the lowest session id wins. The
     * tie-break only has to be a total order every client computes identically —
     * LiveKit publications carry no timestamp, so "whoever started first" is not
     * available to us. Keyed on session id, never user id, since the same person
     * on two devices is two sharers.
     */
    private emitScreenSharingSession() {
        if (!this.room) {
            return;
        }

        const candidates: Participant[] = [];
        if (this.room.localParticipant.getTrackPublication(Track.Source.ScreenShare)) {
            candidates.push(this.room.localParticipant);
        }
        for (const remoteParticipant of this.room.remoteParticipants.values()) {
            if (remoteParticipant.getTrackPublication(Track.Source.ScreenShare)) {
                candidates.push(remoteParticipant);
            }
        }

        let winner: Participant | null = null;
        let winnerSessionID: string | null = null;
        for (const candidate of candidates) {
            const {sessionID} = this.parseUserIdAndSessionIdFromIdentity(candidate);
            if (winnerSessionID === null || sessionID < winnerSessionID) {
                winner = candidate;
                winnerSessionID = sessionID;
            }
        }

        if (candidates.length > 1) {
            logWarn(`CallClient: ${candidates.length} concurrent screen shares, presenting session ${winnerSessionID}`);
        }

        // Keyed on the track set as well as the sharer: composeScreenShareStream
        // allocates a new MediaStream per call, so re-emitting an unchanged share
        // would make consumers re-attach it and flicker. A publication with no
        // track yet (announced, not subscribed) contributes nothing to the key, so
        // subscription registers as a change and re-emits with the stream.
        const trackKey = winner ? [Track.Source.ScreenShare, Track.Source.ScreenShareAudio]
            .map((source) => {
                const pub = winner?.getTrackPublication(source);
                return pub?.track ? pub.trackSid : '';
            }).join(',') : '';

        if (winnerSessionID === this.screenSharingSessionID && trackKey === this.screenShareTrackSIDs) {
            return;
        }
        this.screenSharingSessionID = winnerSessionID;
        this.screenShareTrackSIDs = trackKey;

        if (!winner) {
            logDebug('CallClient: no screen share being presented');
            this.emit(CALL_EVENT.SCREEN_SHARING_CHANGED, null);
            return;
        }

        const {userID, sessionID} = this.parseUserIdAndSessionIdFromIdentity(winner);
        const session: ScreenSharingSession = {
            sessionID,
            userID,
            isLocal: winner === this.room.localParticipant,
            stream: this.composeScreenShareStream(winner),
        };

        logDebug('CallClient: screen share presented', {sessionID, userID, isLocal: session.isLocal, hasStream: Boolean(session.stream)});
        this.emit(CALL_EVENT.SCREEN_SHARING_CHANGED, session);
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

    /**
     * Whether a participant is the recording/transcribing bot. The bot is flagged
     * server-side with a LiveKit attribute on its token grant (see
     * livekitAttributeBot), so this works regardless of how the participant was
     * discovered and is robust to multi-node. Used to keep the bot out of the
     * participant list (no USER_JOINED/USER_LEFT, no join/leave sound or tile).
     */
    private isBotParticipant(p: Participant): boolean {
        return p.attributes?.[CALL_ATTRIBUTES.BOT] === 'true';
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

            // Log the resolved counts so a "zero audio input devices" condition
            // (which silently disables the mic button) can be confirmed directly
            // from downloaded logs rather than inferred from absent log lines.
            logDebug(`CallClient: enumerated audio devices: ${inputs.length} input(s), ${outputs.length} output(s)`);
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
