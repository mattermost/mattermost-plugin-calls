// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {forwardRef, useEffect, useImperativeHandle, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import ReactSelect from 'react-select';
import CallClient from 'src/clients/call';
import {type DevicesSelectionHandle, type DevicesSelectionProps, type SelectOption} from 'src/components/user_settings/common';
import {SettingsField, SettingsSectionCollapsed, SettingsSectionExpanded, useSettingsSection} from 'src/components/user_settings/settings_section';
import {
    STORAGE_CALLS_DEFAULT_AUDIO_INPUT_KEY,
    STORAGE_CALLS_DEFAULT_AUDIO_OUTPUT_KEY,
} from 'src/constants';
import {logErr} from 'src/log';
import type {MediaDevices} from 'src/types/types';

const AUDIO_DEVICES_MESSAGES_ID = 'audioDevicesMessages';

const AudioDevicesSelection = forwardRef<DevicesSelectionHandle, DevicesSelectionProps>(({deviceType, devices, hasError}: DevicesSelectionProps, ref) => {
    const {formatMessage} = useIntl();
    const [selectedOption, setSelectedOption] = useState<SelectOption|null>(null);

    const label = deviceType === 'inputs' ? formatMessage({defaultMessage: 'Microphone input'}) : formatMessage({defaultMessage: 'Speaker output'});

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

        const defaultDeviceData = deviceType === 'inputs' ? window.localStorage.getItem(STORAGE_CALLS_DEFAULT_AUDIO_INPUT_KEY) : window.localStorage.getItem(STORAGE_CALLS_DEFAULT_AUDIO_OUTPUT_KEY);

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
        <SettingsField
            label={label}
            labelId={deviceType + 'Label'}
            htmlFor={deviceType + 'Select'}
        >
            <ReactSelect
                inputId={deviceType + 'Select'}
                aria-labelledby={deviceType + 'Label'}
                aria-invalid={hasError}
                aria-errormessage={hasError ? AUDIO_DEVICES_MESSAGES_ID : undefined}
                className='react-select singleSelect CallsSettingsSection__select'
                classNamePrefix='react-select'
                options={options}
                isClearable={false}
                isSearchable={false}
                components={{IndicatorSeparator: () => null}}
                value={getOption()}
                onChange={(opt) => setSelectedOption(opt)}
            />
        </SettingsField>
    );
});

export default function AudioDevicesSettingsSection() {
    const {formatMessage} = useIntl();
    const {active, focusEdit, open, close} = useSettingsSection();
    const [devices, setDevices] = useState<MediaDevices>({inputs: [], outputs: []});
    const [loadFailed, setLoadFailed] = useState(false);

    const title = formatMessage({defaultMessage: 'Audio devices'});

    const audioInputsRef = useRef<DevicesSelectionHandle>(null);
    const audioOutputsRef = useRef<DevicesSelectionHandle>(null);
    const latestLoadRef = useRef(0);

    // An empty list has nothing to pick, so keep the saved device for that kind.
    const handleSave = () => {
        if (audioInputsRef.current && devices.inputs.length > 0) {
            window.localStorage.setItem(STORAGE_CALLS_DEFAULT_AUDIO_INPUT_KEY, JSON.stringify({
                deviceId: audioInputsRef.current.getOption().value,
                label: audioInputsRef.current.getOption().label,
            }));
        }
        if (audioOutputsRef.current && devices.outputs.length > 0) {
            window.localStorage.setItem(STORAGE_CALLS_DEFAULT_AUDIO_OUTPUT_KEY, JSON.stringify({
                deviceId: audioOutputsRef.current.getOption().value,
                label: audioOutputsRef.current.getOption().label,
            },
            ));
        }
        close();
    };

    const loadAudioDevices = async () => {
        const loadID = ++latestLoadRef.current;
        let loaded: MediaDevices = {inputs: [], outputs: []};
        let failed = false;
        try {
            loaded = await CallClient.getLocalAudioDevices();
        } catch (err) {
            logErr('failed to get audio devices', err);
            failed = true;
        }

        // devicechange can start a load while another is still running; only the newest one applies.
        if (loadID !== latestLoadRef.current) {
            return;
        }
        setDevices(loaded);
        setLoadFailed(failed);
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
            <SettingsSectionCollapsed
                id='audioDevices'
                title={title}
                description={formatMessage({defaultMessage: 'Set up audio devices to be used for Mattermost calls.'})}
                focusEdit={focusEdit}
                onEdit={open}
            />
        );
    }

    return (
        <SettingsSectionExpanded
            id='audioDevices'
            title={title}
            isFullWidth={true}
            onSave={handleSave}
            onCancel={close}
        >
            <div className='CallsSettingsSection__fields'>
                <AudioDevicesSelection
                    deviceType='inputs'
                    devices={devices.inputs}
                    hasError={loadFailed}
                    ref={audioInputsRef}
                />
                <AudioDevicesSelection
                    deviceType='outputs'
                    devices={devices.outputs}
                    hasError={loadFailed}
                    ref={audioOutputsRef}
                />
                {loadFailed && (
                    <span
                        id={AUDIO_DEVICES_MESSAGES_ID}
                        className='CallsSettingsSection__fieldMessage CallsSettingsSection__error'
                        role='alert'
                    >
                        {formatMessage({defaultMessage: 'Couldn\'t load your microphones and speakers. Make sure a microphone is connected and that Mattermost is allowed to use it.'})}
                    </span>
                )}
            </div>
        </SettingsSectionExpanded>
    );
}
