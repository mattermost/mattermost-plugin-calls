// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import './video_devices_settings_section.scss';

import classNames from 'classnames';
import {createLocalVideoTrack, LocalVideoTrack, MediaDeviceFailure, TrackEvent, type VideoCaptureOptions} from 'livekit-client';
import {Client4} from 'mattermost-redux/client';
import {getCurrentUser} from 'mattermost-redux/selectors/entities/users';
import React, {useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import ReactSelect from 'react-select';
import CallClient, {CameraError, CameraState} from 'src/clients/call';
import {CAMERA_CAPTURE_DEFAULTS} from 'src/clients/call/constants';
import Avatar from 'src/components/avatar/avatar';
import {useCameraTrack} from 'src/components/use_camera_track';
import type {SelectOption} from 'src/components/user_settings/common';
import {SettingsField, SettingsSectionCollapsed, SettingsSectionExpanded, useSettingsSection} from 'src/components/user_settings/settings_section';
import VideoTrackPlayer from 'src/components/video_track_player/video_track_player';
import {STORAGE_CALLS_DEFAULT_VIDEO_INPUT_KEY, STORAGE_CALLS_MIRROR_VIDEO} from 'src/constants';
import {logErr} from 'src/log';
import {getCallsClient, getCallsClientSessionID, mirrorSelfView} from 'src/utils';

const SECTION_ID = 'videoDevices';
const VIDEO_INPUT_SELECT_ID = 'videoInputSelect';
const VIDEO_INPUT_LABEL_ID = 'videoInputLabel';
const VIDEO_INPUT_MESSAGES_ID = 'videoInputMessages';
const PREVIEW_LABEL_ID = 'videoPreviewLabel';
const OPTIONS_LABEL_ID = 'videoOptionsLabel';
const MIRROR_NOTE_ID = 'videoMirrorNote';
const PREVIEW_AVATAR_SIZE_PX = 96;

type PreviewState = 'off' | 'starting' | 'on';

type StoredDevice = {
    deviceId: string;
    label?: string;
};

const readStoredDevice = (): StoredDevice | null => {
    const data = window.localStorage.getItem(STORAGE_CALLS_DEFAULT_VIDEO_INPUT_KEY);
    if (!data) {
        return null;
    }
    try {
        return JSON.parse(data);
    } catch {
        return null;
    }
};

const toCameraError = (err: unknown): CameraError => {
    const failure = MediaDeviceFailure.getFailure(err);
    switch (failure) {
    case MediaDeviceFailure.PermissionDenied:
        return CameraError.PermissionDenied;
    case MediaDeviceFailure.NotFound:
        return CameraError.NotFound;
    case MediaDeviceFailure.DeviceInUse:
        return CameraError.DeviceInUse;
    case MediaDeviceFailure.Other:
    case undefined:
        return CameraError.Other;
    default: {
        const unhandled: never = failure;
        return unhandled;
    }
    }
};

const captureOptions = (deviceId: string): VideoCaptureOptions => ({
    ...CAMERA_CAPTURE_DEFAULTS,
    deviceId: deviceId ? {exact: deviceId} : undefined,
});

export default function VideoDevicesSettingsSection() {
    const {formatMessage} = useIntl();
    const currentUser = useSelector(getCurrentUser);
    const {active, focusEdit, open, close} = useSettingsSection();

    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [loadFailed, setLoadFailed] = useState(false);
    const [selectedOption, setSelectedOption] = useState<SelectOption | null>(null);
    const [mirror, setMirror] = useState(mirrorSelfView);
    const [previewTrack, setPreviewTrack] = useState<LocalVideoTrack | null>(null);
    const [previewState, setPreviewState] = useState<PreviewState>('off');
    const [cameraError, setCameraError] = useState<CameraError | null>(null);
    const [announcement, setAnnouncement] = useState('');

    // While in a call with the camera on, the preview shows the call's own track for that camera
    // rather than capturing it a second time.
    const callCamera = useCameraTrack(getCallsClientSessionID());
    const callCameraOn = callCamera.state !== CameraState.Off;
    const callDeviceId = callCamera.track?.mediaStreamTrack.getSettings().deviceId;

    const latestLoadRef = useRef(0);
    const previewTrackRef = useRef<LocalVideoTrack | null>(null);
    const usedCallTrackRef = useRef(false);

    // Bumped on every start and stop so a capture that resolves late is dropped.
    const latestStartRef = useRef(0);

    const title = formatMessage({defaultMessage: 'Video devices'});
    const cameraOnText = formatMessage({defaultMessage: 'Camera on'});
    const cameraOffText = formatMessage({defaultMessage: 'Camera off'});

    // Browsers hide camera labels until the user grants camera access.
    const options: SelectOption[] = devices.map((device, idx) => ({
        value: device.deviceId,
        label: device.label || formatMessage({defaultMessage: 'Camera {number}'}, {number: idx + 1}),
    }));

    const getSelectedOption = (): SelectOption | null => {
        if (selectedOption && options.some((opt) => opt.value === selectedOption.value)) {
            return selectedOption;
        }

        const activeDeviceId = previewTrackRef.current?.mediaStreamTrack.getSettings().deviceId ?? (callCameraOn ? callDeviceId : undefined);
        const activeOption = activeDeviceId && options.find((opt) => opt.value === activeDeviceId);
        if (activeOption) {
            return activeOption;
        }

        const stored = readStoredDevice();
        if (stored) {
            const byId = options.find((opt) => opt.value === stored.deviceId);
            const byLabel = stored.label ? devices.find((dev) => dev.label === stored.label) : undefined;
            const match = byId ?? options.find((opt) => opt.value === byLabel?.deviceId);
            if (match) {
                return match;
            }
        }

        return options[0] ?? null;
    };

    // Until the call's track reports its device, assume it is the one picked.
    const isCallCamera = (deviceId: string | undefined) => callCameraOn && (!callDeviceId || !deviceId || deviceId === callDeviceId);

    const usesCallTrack = previewState !== 'off' && isCallCamera(getSelectedOption()?.value);
    const shownTrack = usesCallTrack ? callCamera.track : previewTrack;

    // Only ever stops the preview's own capture, never the call's track.
    const releasePreview = () => {
        latestStartRef.current++;
        previewTrackRef.current?.stop();
        previewTrackRef.current = null;
    };

    const stopPreview = () => {
        releasePreview();
        setPreviewTrack(null);
        setPreviewState('off');
    };

    const loadVideoDevices = async () => {
        const loadID = ++latestLoadRef.current;
        let loaded: MediaDeviceInfo[] = [];
        let failed = false;
        try {
            loaded = await CallClient.getLocalVideoDevices();
        } catch (err) {
            logErr('failed to get video devices', err);
            failed = true;
        }

        // devicechange can start a load while another is still running; only the newest one applies.
        if (loadID !== latestLoadRef.current) {
            return;
        }
        setDevices(loaded);
        setLoadFailed(failed);
    };

    const startCapture = async (deviceId: string) => {
        const startID = ++latestStartRef.current;

        let track: LocalVideoTrack;
        try {
            track = await createLocalVideoTrack(captureOptions(deviceId));
        } catch (err) {
            if (startID !== latestStartRef.current) {
                return;
            }
            logErr('failed to start camera preview', err);
            setCameraError(toCameraError(err));
            setPreviewState('off');
            return;
        }

        if (startID !== latestStartRef.current) {
            track.stop();
            return;
        }

        track.on(TrackEvent.Ended, () => {
            if (previewTrackRef.current !== track) {
                return;
            }
            stopPreview();
            setCameraError(CameraError.Disconnected);
            setAnnouncement(cameraOffText);
        });
        previewTrackRef.current = track;
        setPreviewTrack(track);

        // Labels become available once access is granted.
        loadVideoDevices();
    };

    const handleTurnOn = () => {
        setCameraError(null);
        setPreviewState('starting');

        const deviceId = getSelectedOption()?.value ?? '';
        if (!isCallCamera(deviceId)) {
            startCapture(deviceId);
        }
    };

    const handleTurnOff = () => {
        stopPreview();
        setAnnouncement(cameraOffText);
    };

    const handlePreviewPlaying = () => {
        if (previewState !== 'on') {
            setPreviewState('on');
            setAnnouncement(cameraOnText);
        }
    };

    const handleSelect = async (opt: SelectOption | null) => {
        if (!opt) {
            return;
        }
        setSelectedOption(opt);

        // Moving onto or off the call's camera is handled by the effect below.
        const track = previewTrackRef.current;
        if (previewState === 'off' || isCallCamera(opt.value) || !track) {
            return;
        }
        setCameraError(null);
        try {
            await track.restartTrack(captureOptions(opt.value));
        } catch (err) {
            if (previewTrackRef.current !== track) {
                return;
            }
            logErr('failed to switch camera preview', err);
            stopPreview();
            setCameraError(toCameraError(err));
            setAnnouncement(cameraOffText);
        }
    };

    useEffect(() => {
        const usedCallTrack = usedCallTrackRef.current;
        usedCallTrackRef.current = usesCallTrack;

        if (usesCallTrack) {
            releasePreview();
            setPreviewTrack(null);
            return;
        }
        if (!usedCallTrack || previewState === 'off') {
            return;
        }

        if (callCameraOn) {
            startCapture(getSelectedOption()?.value ?? '');
        } else {
            stopPreview();
            setAnnouncement(cameraOffText);
        }
    }, [usesCallTrack, callCameraOn]);

    const handleOpen = () => {
        setSelectedOption(null);
        setMirror(mirrorSelfView());
        setPreviewTrack(null);
        setPreviewState('off');
        setCameraError(null);
        setAnnouncement('');
        open();
    };

    // An empty list has nothing to pick, so keep the saved camera.
    const handleSave = () => {
        const selected = getSelectedOption();
        const device = devices.find((dev) => dev.deviceId === selected?.value);
        if (device?.deviceId) {
            window.localStorage.setItem(STORAGE_CALLS_DEFAULT_VIDEO_INPUT_KEY, JSON.stringify({
                deviceId: device.deviceId,
                label: device.label,
            }));
        }
        window.localStorage.setItem(STORAGE_CALLS_MIRROR_VIDEO, mirror ? 'on' : 'off');

        // Released first so the call can open the camera this preview was holding.
        stopPreview();
        if (device?.deviceId && callCameraOn && callDeviceId && device.deviceId !== callDeviceId) {
            getCallsClient()?.setVideoInputDevice(device);
        }
        close();
    };

    const handleCancel = () => {
        stopPreview();
        close();
    };

    useEffect(() => {
        if (!active) {
            return undefined;
        }
        loadVideoDevices();
        navigator.mediaDevices?.addEventListener('devicechange', loadVideoDevices);
        return () => {
            navigator.mediaDevices?.removeEventListener('devicechange', loadVideoDevices);
            releasePreview();
        };
    }, [active]);

    const getCameraErrorMessage = (err: CameraError) => {
        switch (err) {
        case CameraError.PermissionDenied:
            return formatMessage({defaultMessage: 'Camera access was blocked. Allow it in your browser settings.'});
        case CameraError.NotFound:
            return formatMessage({defaultMessage: 'No camera found.'});
        case CameraError.DeviceInUse:
            return formatMessage({defaultMessage: 'Your camera is being used by another app. Close that app and try again.'});
        case CameraError.Disconnected:
            return formatMessage({defaultMessage: 'Camera disconnected.'});
        case CameraError.Other:
            return formatMessage({defaultMessage: 'Couldn\'t start your camera. Try again.'});
        default: {
            const unhandled: never = err;
            return unhandled;
        }
        }
    };

    if (!active) {
        return (
            <SettingsSectionCollapsed
                id={SECTION_ID}
                title={title}
                description={formatMessage({defaultMessage: 'Set up video devices to be used for Mattermost calls.'})}
                focusEdit={focusEdit}
                onEdit={handleOpen}
            />
        );
    }

    const previewOn = previewState !== 'off';
    const videoShowing = previewState === 'on' && shownTrack !== null;
    const hasMessage = loadFailed || cameraError !== null;

    return (
        <SettingsSectionExpanded
            id={SECTION_ID}
            title={title}
            isFullWidth={true}
            className='VideoDevicesSettings'
            onSave={handleSave}
            onCancel={handleCancel}
        >
            <div className='CallsSettingsSection__fields'>
                <SettingsField
                    label={formatMessage({defaultMessage: 'Camera input'})}
                    labelId={VIDEO_INPUT_LABEL_ID}
                    htmlFor={VIDEO_INPUT_SELECT_ID}
                >
                    <ReactSelect
                        inputId={VIDEO_INPUT_SELECT_ID}
                        aria-labelledby={VIDEO_INPUT_LABEL_ID}
                        aria-invalid={hasMessage}
                        aria-errormessage={hasMessage ? VIDEO_INPUT_MESSAGES_ID : undefined}
                        className='react-select singleSelect CallsSettingsSection__select'
                        classNamePrefix='react-select'
                        options={options}
                        isClearable={false}
                        isSearchable={false}
                        isDisabled={previewState === 'starting'}
                        components={{IndicatorSeparator: () => null}}
                        value={getSelectedOption()}
                        onChange={handleSelect}
                    />
                </SettingsField>
                {hasMessage && (
                    <div
                        id={VIDEO_INPUT_MESSAGES_ID}
                        className='CallsSettingsSection__fieldMessage'
                        role='alert'
                    >
                        {loadFailed && (
                            <span className='CallsSettingsSection__error'>
                                {formatMessage({defaultMessage: 'Unable to load video devices. Make sure a camera is connected and that Mattermost is allowed to use it.'})}
                            </span>
                        )}
                        {cameraError && (
                            <span className='CallsSettingsSection__error'>
                                {getCameraErrorMessage(cameraError)}
                            </span>
                        )}
                    </div>
                )}
                <SettingsField
                    label={formatMessage({defaultMessage: 'Preview'})}
                    labelId={PREVIEW_LABEL_ID}
                    alignTop={true}
                >
                    <div
                        className='VideoDevicesSettings__preview'
                        role='group'
                        aria-label={formatMessage({defaultMessage: 'Camera preview'})}
                    >
                        {shownTrack && (
                            <VideoTrackPlayer
                                track={shownTrack}
                                onPlaying={handlePreviewPlaying}
                                className={classNames('VideoDevicesSettings__video', {
                                    'VideoDevicesSettings__video--mirrored': mirror,
                                    'VideoDevicesSettings__video--hidden': !videoShowing,
                                })}
                            />
                        )}
                        {!videoShowing && currentUser && (
                            <Avatar
                                size={PREVIEW_AVATAR_SIZE_PX}
                                url={Client4.getProfilePictureUrl(currentUser.id, currentUser.last_picture_update)}
                                username={currentUser.username}
                            />
                        )}
                        {previewOn && !videoShowing && (
                            <span className='VideoDevicesSettings__status'>
                                {formatMessage({defaultMessage: 'Starting camera…'})}
                            </span>
                        )}
                    </div>
                    <button
                        type='button'
                        className='btn btn-tertiary'
                        onClick={previewOn ? handleTurnOff : handleTurnOn}
                    >
                        {previewOn ? formatMessage({defaultMessage: 'Turn off camera'}) : formatMessage({defaultMessage: 'Turn on camera'})}
                    </button>
                </SettingsField>
                <SettingsField
                    label={formatMessage({defaultMessage: 'Options'})}
                    labelId={OPTIONS_LABEL_ID}
                    alignTop={true}
                >
                    <div
                        role='group'
                        aria-labelledby={OPTIONS_LABEL_ID}
                    >
                        <div className='checkbox VideoDevicesSettings__checkbox'>
                            <label>
                                <input
                                    type='checkbox'
                                    checked={mirror}
                                    aria-describedby={MIRROR_NOTE_ID}
                                    onChange={(e) => setMirror(e.target.checked)}
                                />
                                {formatMessage({defaultMessage: 'Mirror my video'})}
                            </label>
                        </div>
                        <span
                            id={MIRROR_NOTE_ID}
                            className='help-text VideoDevicesSettings__mirrorNote'
                        >
                            {formatMessage({defaultMessage: 'Only you see it mirrored. Saved on this device only.'})}
                        </span>
                    </div>
                </SettingsField>
                <span
                    className='VideoDevicesSettings__liveRegion'
                    aria-live='polite'
                >
                    {announcement}
                </span>
            </div>
        </SettingsSectionExpanded>
    );
}
