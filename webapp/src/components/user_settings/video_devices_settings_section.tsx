// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import './user_settings.scss';
import './video_devices_settings_section.scss';

import classNames from 'classnames';
import {createLocalVideoTrack, LocalVideoTrack, MediaDeviceFailure, TrackEvent, type VideoCaptureOptions} from 'livekit-client';
import {Client4} from 'mattermost-redux/client';
import {getCurrentUser} from 'mattermost-redux/selectors/entities/users';
import React, {useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import ReactSelect from 'react-select';
import CallClient, {CameraError} from 'src/clients/call';
import {CAMERA_CAPTURE_DEFAULTS} from 'src/clients/call/constants';
import Avatar from 'src/components/avatar/avatar';
import {Description, Fieldset, SelectionWrapper, SelectLabel, type SelectOption} from 'src/components/user_settings/common';
import VideoTrackPlayer from 'src/components/video_track_player';
import {STORAGE_CALLS_DEFAULT_VIDEO_INPUT_KEY, STORAGE_CALLS_MIRROR_VIDEO} from 'src/constants';
import {logErr} from 'src/log';

const VIDEO_INPUT_SELECT_ID = 'videoInputSelect';
const VIDEO_INPUT_LABEL_ID = 'videoInputLabel';
const VIDEO_INPUT_MESSAGES_ID = 'videoInputMessages';
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

const readStoredMirror = () => window.localStorage.getItem(STORAGE_CALLS_MIRROR_VIDEO) === 'on';

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

    const [active, setActive] = useState(false);
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [loadFailed, setLoadFailed] = useState(false);
    const [selectedOption, setSelectedOption] = useState<SelectOption | null>(null);
    const [mirror, setMirror] = useState(readStoredMirror);
    const [previewTrack, setPreviewTrack] = useState<LocalVideoTrack | null>(null);
    const [previewState, setPreviewState] = useState<PreviewState>('off');
    const [cameraError, setCameraError] = useState<CameraError | null>(null);
    const [announcement, setAnnouncement] = useState('');

    const latestLoadRef = useRef(0);
    const previewTrackRef = useRef<LocalVideoTrack | null>(null);

    // Bumped on every start and stop so a capture that resolves late is dropped.
    const latestStartRef = useRef(0);

    const title = formatMessage({defaultMessage: 'Video devices'});
    const description = formatMessage({defaultMessage: 'Set up a camera to be used for Mattermost calls'});
    const editLabel = formatMessage({defaultMessage: 'Edit'});
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

        const previewDeviceId = previewTrackRef.current?.mediaStreamTrack.getSettings().deviceId;
        const previewOption = previewDeviceId && options.find((opt) => opt.value === previewDeviceId);
        if (previewOption) {
            return previewOption;
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

    const handleTurnOn = async () => {
        const startID = ++latestStartRef.current;
        setCameraError(null);
        setPreviewState('starting');

        let track: LocalVideoTrack;
        try {
            track = await createLocalVideoTrack(captureOptions(getSelectedOption()?.value ?? ''));
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

        const track = previewTrackRef.current;
        if (!track) {
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

    const handleOpen = () => {
        setSelectedOption(null);
        setMirror(readStoredMirror());
        setPreviewTrack(null);
        setPreviewState('off');
        setCameraError(null);
        setAnnouncement('');
        setActive(true);
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
        setActive(false);
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
            <div
                className='section-min'
                onClick={handleOpen}
            >
                <div className='section-min__header'>
                    <h4
                        id='videoDevicesTitle'
                        className='section-min__title'
                    >
                        <span>{title}</span>
                    </h4>
                    <button
                        id='videoDevicesEdit'
                        className='color--link style--none section-min__edit'
                        aria-labelledby='videoDevicesTitle videoDevicesEdit'
                        aria-expanded={active}
                    >
                        <i
                            className='icon-pencil-outline'
                            title={editLabel}
                        />
                        <span>{editLabel}</span>
                    </button>
                </div>
                <div className='section-min__describe'>
                    <span>{description}</span>
                </div>
            </div>
        );
    }

    const previewOn = previewState !== 'off';
    const hasMessage = loadFailed || cameraError !== null;

    return (
        <section className='section-max form-horizontal VideoDevicesSettings'>
            <h4 className='col-sm-12 section-title'>
                <span>{title}</span>
            </h4>
            <div className='sectionContent col-sm-10 col-sm-offset-2'>
                <div
                    tabIndex={-1}
                    className='setting-list'
                >
                    <div className='setting-list-item'>
                        <Fieldset>
                            <SelectionWrapper>
                                <SelectLabel
                                    id={VIDEO_INPUT_LABEL_ID}
                                    htmlFor={VIDEO_INPUT_SELECT_ID}
                                >
                                    {formatMessage({defaultMessage: 'Camera input'})}
                                </SelectLabel>
                                <ReactSelect
                                    inputId={VIDEO_INPUT_SELECT_ID}
                                    aria-labelledby={VIDEO_INPUT_LABEL_ID}
                                    aria-invalid={hasMessage}
                                    aria-errormessage={hasMessage ? VIDEO_INPUT_MESSAGES_ID : undefined}
                                    className='react-select singleSelect devices_settings_select'
                                    classNamePrefix='react-select'
                                    options={options}
                                    isClearable={false}
                                    isSearchable={false}
                                    isDisabled={previewState === 'starting'}
                                    components={{IndicatorSeparator: () => null}}
                                    value={getSelectedOption()}
                                    onChange={handleSelect}
                                />
                            </SelectionWrapper>
                            {hasMessage && (
                                <div
                                    id={VIDEO_INPUT_MESSAGES_ID}
                                    className='VideoDevicesSettings__messages'
                                    role='alert'
                                >
                                    {loadFailed && (
                                        <span className='devices_settings_error'>
                                            {formatMessage({defaultMessage: 'Unable to load video devices. Make sure a camera is connected and that Mattermost is allowed to use it.'})}
                                        </span>
                                    )}
                                    {cameraError && (
                                        <span className='devices_settings_error'>
                                            {getCameraErrorMessage(cameraError)}
                                        </span>
                                    )}
                                </div>
                            )}
                            <div
                                className='VideoDevicesSettings__preview'
                                role='group'
                                aria-label={formatMessage({defaultMessage: 'Camera preview'})}
                            >
                                {previewTrack && (
                                    <VideoTrackPlayer
                                        track={previewTrack}
                                        onPlaying={handlePreviewPlaying}
                                        className={classNames('VideoDevicesSettings__video', {
                                            'VideoDevicesSettings__video--mirrored': mirror,
                                            'VideoDevicesSettings__video--hidden': previewState !== 'on',
                                        })}
                                    />
                                )}
                                {previewState !== 'on' && currentUser && (
                                    <Avatar
                                        size={PREVIEW_AVATAR_SIZE_PX}
                                        url={Client4.getProfilePictureUrl(currentUser.id, currentUser.last_picture_update)}
                                        username={currentUser.username}
                                    />
                                )}
                                {previewState === 'starting' && (
                                    <span className='VideoDevicesSettings__status'>
                                        {formatMessage({defaultMessage: 'Starting camera…'})}
                                    </span>
                                )}
                            </div>
                            <div>
                                <button
                                    type='button'
                                    className='btn btn-tertiary'
                                    onClick={previewOn ? handleTurnOff : handleTurnOn}
                                >
                                    {previewOn ? formatMessage({defaultMessage: 'Turn off camera'}) : formatMessage({defaultMessage: 'Turn on camera'})}
                                </button>
                            </div>
                            <div className='checkbox'>
                                <label>
                                    <input
                                        type='checkbox'
                                        checked={mirror}
                                        onChange={(e) => setMirror(e.target.checked)}
                                    />
                                    {formatMessage({defaultMessage: 'Mirror video'})}
                                </label>
                            </div>
                            <span
                                className='VideoDevicesSettings__liveRegion'
                                aria-live='polite'
                            >
                                {announcement}
                            </span>
                            <Description>{description}</Description>
                        </Fieldset>
                    </div>
                    <div className='setting-list-item'>
                        <hr/>
                        <button
                            type='submit'
                            className='btn btn-primary'
                            onClick={handleSave}
                        >
                            {formatMessage({defaultMessage: 'Save'})}
                        </button>
                        <button
                            className='btn btn-tertiary'
                            onClick={() => setActive(false)}
                        >
                            {formatMessage({defaultMessage: 'Cancel'})}
                        </button>
                    </div>
                </div>
            </div>
        </section>
    );
}
