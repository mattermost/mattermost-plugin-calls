// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {isFirefox} from '@mattermost/calls-common/lib/utils';
import React, {forwardRef, useEffect, useImperativeHandle, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {DefaultVideoTrackOptions} from 'src/client';
import {
    Description, type DevicesSelectionHandle, type DevicesSelectionProps, Fieldset,
    SelectionWrapper, SelectLabel, type SelectOption, StyledReactSelect} from 'src/components/user_settings/common';
import {
    STORAGE_CALLS_DEFAULT_VIDEO_INPUT_KEY,
    STORAGE_CALLS_MIRROR_VIDEO_KEY,
} from 'src/constants';
import {getBgBlurData, setBgBlurData} from 'src/local_storage';
import {logErr} from 'src/log';
import Segmenter from 'src/segmenter';
import {untranslatable} from 'src/utils';
import styled, {css} from 'styled-components';

const VideoDevicesSelection = forwardRef<DevicesSelectionHandle, DevicesSelectionProps>(({devices, onSelectionChange}: DevicesSelectionProps, ref) => {
    const {formatMessage} = useIntl();
    const [selectedOption, setSelectedOption] = useState<SelectOption|null>(null);
    const [initalSet, setInitialSet] = useState(false);

    const label = formatMessage({defaultMessage: 'Camera input'});

    const options = devices.map((device) => {
        return {
            value: device.deviceId,
            label: device.label,
        };
    });

    const getDefaultOpt = () => {
        const defaultDeviceData = window.localStorage.getItem(STORAGE_CALLS_DEFAULT_VIDEO_INPUT_KEY);

        let defaultDevice: {deviceId: string; label?: string} = {
            deviceId: '',
        };

        if (defaultDeviceData) {
            defaultDevice = JSON.parse(defaultDeviceData);
        }

        let selected = devices.filter((dev) => {
            return dev.deviceId === defaultDevice.deviceId || dev.label === defaultDevice.label;
        });
        if (selected.length > 1) {
            // If there are multiple devices with the same label, we select the default device by ID.
            selected = selected.filter((dev) => dev.deviceId === defaultDevice.deviceId);
        }

        if (selected.length > 0) {
            return {
                label: selected[0].label,
                value: selected[0].deviceId,
            };
        }

        return {
            label: devices[0]?.label ?? '',
            value: devices[0]?.deviceId ?? '',
        };
    };

    useEffect(() => {
        if (!initalSet && onSelectionChange && devices.length > 0) {
            onSelectionChange(getDefaultOpt());
            setInitialSet(true);
        }
    }, [devices]);

    const getOption = () => {
        if (selectedOption) {
            return selectedOption;
        }
        return getDefaultOpt();
    };

    useImperativeHandle(ref, () => {
        return {
            getOption,
        };
    }, [devices, selectedOption]);

    return (
        <SelectionWrapper>
            <SelectLabel
                id={name + 'Label'}
                htmlFor={name + 'Select'}
            >
                {label}
            </SelectLabel>
            <StyledReactSelect
                inputId={name + 'Select'}
                aria-labelledby={name + 'Label'}
                className='react-select singleSelect'
                classNamePrefix='react-select'
                options={options}
                clearable={false}
                isClearable={false}
                isSearchable={false}
                components={{IndicatorSeparator: () => null}}
                value={getOption()}
                onChange={(opt: SelectOption) => {
                    if (onSelectionChange) {
                        onSelectionChange(opt);
                    }
                    setSelectedOption(opt);
                }}
            />
        </SelectionWrapper>
    );
});

const StyledVideo = styled.video<{$mirror: boolean}>`
   width: 100%;
   border-radius: 8px;

  ${({$mirror}) => $mirror && css`
    transform: scaleX(-1);
  `}
`;

const VideoContainer = styled.div`
   position: relative;
   width: 80%;
`;

const StyledCanvas = styled.canvas<{$mirror: boolean}>`
   position: absolute;
   top: 0;
   left: 0;
   width: 100%;
   border-radius: 8px;

  ${({$mirror}) => $mirror && css`
    transform: scaleX(-1);
  `}
`;

function VideoPreview(props: {
    stream: MediaStream|null,
    mirror: boolean,
    blurBackground: boolean,
    blurIntensity: number,
}) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const segRef = useRef<any>(null);

    useEffect(() => {
        if (props.stream && props.blurBackground && videoRef.current && canvasRef.current) {
            const s = new Segmenter({
                inputVideo: videoRef.current,
                outputCanvas: canvasRef.current,
            });
            s.setBlurIntensity(props.blurIntensity);
            segRef.current = s;
        }

        return () => {
            if (segRef.current) {
                segRef.current.stop();
                segRef.current = null;
            }
        };
    }, [props.blurBackground, props.stream]);

    useEffect(() => {
        if (segRef.current && props.blurBackground) {
            segRef.current.setBlurIntensity(props.blurIntensity);
        }
    }, [props.blurIntensity]);

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.srcObject = props.stream;
        }
    }, [props.stream, videoRef.current]);

    if (!props.stream) {
        return null;
    }

    return (
        <VideoContainer>
            <StyledVideo
                ref={videoRef}
                autoPlay={true}
                muted={true}
                $mirror={props.mirror}
            />
            {props.blurBackground && (
                <StyledCanvas
                    ref={canvasRef}
                    $mirror={props.mirror}
                />
            )}
        </VideoContainer>
    );
}

const CheckBoxContainer = styled.div`
    display: flex;
    gap: 8px;
    align-items: center;

    label {
      font-weight: 400;
      margin: 0;
      line-height: 16px;
    }

    input {
      margin: 0;
      line-height: 16px;
    }
`;

const SliderContainer = styled.div`
    margin-top: 10px;
    margin-left: 24px;
    display: flex;
    flex-direction: column;
    gap: 4px;

    label {
      font-weight: 400;
      font-size: 14px;
    }

    input[type="range"] {
      width: 200px;
    }

    .slider-value {
      font-size: 12px;
      color: rgba(var(--center-channel-color-rgb), 0.64);
    }
`;

export default function VideoDevicesSettingsSection() {
    const {formatMessage} = useIntl();
    const [active, setActive] = useState(false);
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [previewStream, setPreviewStream] = useState<MediaStream|null>(null);
    const [mirrorVideo, setMirrorVideo] = useState(localStorage.getItem(STORAGE_CALLS_MIRROR_VIDEO_KEY) === 'true');
    const bgBlurData = getBgBlurData();
    const [blurBackground, setBlurBackground] = useState(bgBlurData.blurBackground);
    const [blurIntensity, setBlurIntensity] = useState(bgBlurData.blurIntensity);

    const title = formatMessage({defaultMessage: 'Video devices'});
    const description = formatMessage({defaultMessage: 'Set up video devices to be used for Mattermost calls'});
    const editLabel = formatMessage({defaultMessage: 'Edit'});

    const videoInputsRef = useRef<DevicesSelectionHandle>(null);

    const handleSave = () => {
        if (videoInputsRef.current) {
            window.localStorage.setItem(STORAGE_CALLS_DEFAULT_VIDEO_INPUT_KEY, JSON.stringify({
                deviceId: videoInputsRef.current.getOption().value,
                label: videoInputsRef.current.getOption().label,
            }));
        }

        window.localStorage.setItem(STORAGE_CALLS_MIRROR_VIDEO_KEY, String(mirrorVideo));
        setBgBlurData({blurBackground, blurIntensity});

        setActive(false);
    };

    const loadVideoDevices = async () => {
        let stream;
        try {
            // We need to ask for permissions as certain browsers (e.g. Firefox) won't give
            // readable device labels otherwise.
            stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: false,
            });
            setDevices(await navigator.mediaDevices.enumerateDevices());
        } catch (err) {
            logErr('failed to get video devices', err);
        } finally {
            // We immediately stop the track as soon as we get the devices info (or error). No need
            // to keep it around until we need to show more fancy information such as
            // video previews.
            stream?.getTracks().forEach((track) => {
                track.stop();
            });
        }
    };

    useEffect(() => {
        return () => {
            previewStream?.getVideoTracks().forEach((track) => {
                track.stop();
            });
        };
    }, [previewStream]);

    useEffect(() => {
        if (active) {
            loadVideoDevices();
            navigator.mediaDevices?.addEventListener('devicechange', loadVideoDevices);
        }
        return () => {
            navigator.mediaDevices?.removeEventListener('devicechange', loadVideoDevices);
        };
    }, [active]);

    if (!active) {
        return (
            <div
                className='section-min'
                onClick={() => setActive(!active)}
            >
                <div className='secion-min__header'>
                    <h4 className='section-min__title'>
                        <span>{title}</span>
                    </h4>
                    <button
                        className='color--link style--none section-min__edit'
                        aria-labelledby=''
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

    return (
        <section className='section-max form-horizontal'>
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
                            <VideoDevicesSelection
                                deviceType='videoinput'
                                devices={devices.filter((device) => device.kind === 'videoinput')}
                                onSelectionChange={async (opt) => {
                                    previewStream?.getVideoTracks()[0].stop();

                                    const videoOpts = {
                                        ...DefaultVideoTrackOptions,
                                    };

                                    if (opt.value !== '') {
                                        videoOpts.deviceId = {
                                            exact: opt.value,
                                        };
                                    }

                                    const stream = await navigator.mediaDevices.getUserMedia({
                                        video: videoOpts,
                                        audio: false,
                                    });

                                    setPreviewStream(stream);
                                }}
                                ref={videoInputsRef}
                            />
                            <VideoPreview
                                stream={previewStream}
                                mirror={mirrorVideo}
                                blurBackground={blurBackground}
                                blurIntensity={blurIntensity}
                            />
                            <CheckBoxContainer>
                                <input
                                    type='checkbox'
                                    id='mirror'
                                    name='mirror'
                                    checked={mirrorVideo}
                                    onChange={e => setMirrorVideo(e.target.checked)}
                                />
                                <label htmlFor='mirror'>{formatMessage({defaultMessage: 'Mirror video'})}</label>
                            </CheckBoxContainer>
                            {!isFirefox() &&
                            <CheckBoxContainer>
                                <input
                                    type='checkbox'
                                    id='blur-background'
                                    name='blur-background'
                                    checked={blurBackground}
                                    onChange={e => setBlurBackground(e.target.checked)}
                                />
                                <label htmlFor='blur-background'>{formatMessage({defaultMessage: 'Blur background'})}</label>
                            </CheckBoxContainer>
                            }
                            {blurBackground && (
                                <SliderContainer>
                                    <label htmlFor='blur-intensity'>{formatMessage({defaultMessage: 'Blur intensity'})}</label>
                                    <input
                                        type='range'
                                        id='blur-intensity'
                                        name='blur-intensity'
                                        min='1'
                                        max='20'
                                        value={blurIntensity}
                                        onChange={e => setBlurIntensity(parseInt(e.target.value, 10))}
                                    />
                                    <span className='slider-value'>{untranslatable(`${blurIntensity}px`)}</span>
                                </SliderContainer>
                            )}
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
