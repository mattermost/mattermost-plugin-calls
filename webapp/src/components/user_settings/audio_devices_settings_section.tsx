// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {forwardRef, useEffect, useImperativeHandle, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    Description, type DevicesSelectionHandle, type DevicesSelectionProps, Fieldset,
    SelectionWrapper, SelectLabel, type SelectOption, StyledReactSelect} from 'src/components/user_settings/common';
import {
    STORAGE_CALLS_DEFAULT_AUDIO_INPUT_KEY,
    STORAGE_CALLS_DEFAULT_AUDIO_OUTPUT_KEY,
} from 'src/constants';
import {logErr} from 'src/log';

const AudioDevicesSelection = forwardRef<DevicesSelectionHandle, DevicesSelectionProps>(({deviceType, devices}: DevicesSelectionProps, ref) => {
    const {formatMessage} = useIntl();
    const [selectedOption, setSelectedOption] = useState<SelectOption|null>(null);

    const label = deviceType === 'inputs' ?
        formatMessage({defaultMessage: 'Microphone input'}) :
        formatMessage({defaultMessage: 'Speaker output'});

    const options = devices.map((device) => {
        return {
            value: device.deviceId,
            label: device.label,
        };
    });

    const getOption = () => {
        if (selectedOption) {
            return selectedOption;
        }

        const defaultDeviceData = deviceType === 'inputs' ?
            window.localStorage.getItem(STORAGE_CALLS_DEFAULT_AUDIO_INPUT_KEY) :
            window.localStorage.getItem(STORAGE_CALLS_DEFAULT_AUDIO_OUTPUT_KEY);

        let defaultDevice: {deviceId: string; label?: string} = {
            deviceId: '',
        };

        if (defaultDeviceData) {
            try {
                defaultDevice = JSON.parse(defaultDeviceData);
            } catch {
                // Backwards compatibility case when we used to store the device id directly (before MM-63274).
                defaultDevice = {
                    deviceId: defaultDeviceData,
                };
            }
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
                onChange={(opt: SelectOption) => setSelectedOption(opt)}
            />
        </SelectionWrapper>
    );
});

export default function AudioDevicesSettingsSection() {
    const {formatMessage} = useIntl();
    const [active, setActive] = useState(false);
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

    const title = formatMessage({defaultMessage: 'Audio devices'});
    const description = formatMessage({defaultMessage: 'Set up audio devices to be used for Mattermost calls'});
    const editLabel = formatMessage({defaultMessage: 'Edit'});

    const audioInputsRef = useRef<DevicesSelectionHandle>(null);
    const audioOutputsRef = useRef<DevicesSelectionHandle>(null);

    const handleSave = () => {
        if (audioInputsRef.current) {
            window.localStorage.setItem(STORAGE_CALLS_DEFAULT_AUDIO_INPUT_KEY, JSON.stringify({
                deviceId: audioInputsRef.current.getOption().value,
                label: audioInputsRef.current.getOption().label,
            }));
        }
        if (audioOutputsRef.current) {
            window.localStorage.setItem(STORAGE_CALLS_DEFAULT_AUDIO_OUTPUT_KEY, JSON.stringify({
                deviceId: audioOutputsRef.current.getOption().value,
                label: audioOutputsRef.current.getOption().label,
            },
            ));
        }
        setActive(false);
    };

    const loadAudioDevices = async () => {
        let stream;
        try {
            // We need to ask for permissions as certain browsers (e.g. Firefox) won't give
            // readable device labels otherwise.
            stream = await navigator.mediaDevices.getUserMedia({
                video: false,
                audio: true,
            });
            setDevices(await navigator.mediaDevices.enumerateDevices());
        } catch (err) {
            logErr('failed to get audio devices', err);
        } finally {
            // We immediately stop the track as soon as we get the devices info (or error). No need
            // to keep it around until we need to show more fancy information such as
            // audio levels.
            stream?.getTracks().forEach((track) => {
                track.stop();
            });
        }
    };

    useEffect(() => {
        if (active) {
            loadAudioDevices();
            navigator.mediaDevices?.addEventListener('devicechange', loadAudioDevices);
        }
        return () => {
            navigator.mediaDevices?.removeEventListener('devicechange', loadAudioDevices);
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
                            <AudioDevicesSelection
                                deviceType='inputs'
                                devices={devices.filter((device) => device.kind === 'audioinput')}
                                ref={audioInputsRef}
                            />
                            <AudioDevicesSelection
                                deviceType='outputs'
                                devices={devices.filter((device) => device.kind === 'audiooutput')}
                                ref={audioOutputsRef}
                            />
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
