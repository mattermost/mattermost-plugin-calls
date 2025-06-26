// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {useDispatch, useSelector} from 'react-redux';
import {openCallsUserSettings} from 'src/actions';
import CCIcon from 'src/components/icons/cc_icon';
import HorizontalDotsIcon from 'src/components/icons/horizontal_dots';
import SettingsWheelIcon from 'src/components/icons/settings_wheel';
import ShowMoreIcon from 'src/components/icons/show_more';
import SpeakerIcon from 'src/components/icons/speaker_icon';
import TickIcon from 'src/components/icons/tick';
import UnmutedIcon from 'src/components/icons/unmuted_icon';
import VideoOnIcon from 'src/components/icons/video_on';
import {areLiveCaptionsAvailableInCurrentCall, callsConfig} from 'src/selectors';
import type {
    MediaDevices,
} from 'src/types/types';
import {getCallsClient} from 'src/utils';
import styled from 'styled-components';

import ControlsButton from './controls_button';

type MediaDevicesListProps = {
    deviceType: string;
    devices: MediaDeviceInfo[];
    currentDevice: MediaDeviceInfo | null;
    onDeviceClick: (device: MediaDeviceInfo) => void;
}

const MediaDevicesList = ({deviceType, devices, currentDevice, onDeviceClick}: MediaDevicesListProps) => {
    const {formatMessage} = useIntl();

    // Note: this is system default, not the concept of default that we save in local storage in client.ts
    const makeDeviceLabel = (device: MediaDeviceInfo) => {
        if (device.deviceId.startsWith('default') && !device.label.startsWith('Default')) {
            return formatMessage({defaultMessage: 'Default - {deviceLabel}'}, {deviceLabel: device.label});
        }
        return device.label;
    };

    const list = devices.map((device) => {
        const isCurrentDevice = device.deviceId === currentDevice?.deviceId;
        return (
            <li
                className='MenuItem'
                key={`${deviceType}-device-${device.deviceId}`}
                role='menuitem'
                aria-label={makeDeviceLabel(device)}
            >
                <DeviceButton
                    className='style--none'
                    onClick={() => onDeviceClick(device)}
                    $isCurrentDevice={isCurrentDevice}
                >
                    <DeviceName>
                        {makeDeviceLabel(device)}
                    </DeviceName>
                    { isCurrentDevice &&
                    <DeviceSelectedIcon>
                        <TickIcon/>
                    </DeviceSelectedIcon>
                    }
                </DeviceButton>
            </li>
        );
    });

    return (
        <div
            className='Menu'
            role='menu'
            style={{position: 'relative'}}
        >
            <DevicesList
                id={`calls-popout-${deviceType}s-menu`}
                className='Menu__content dropdown-menu'
            >
                {list}
            </DevicesList>
        </div>
    );
};

const DeviceSelectedIcon = styled.div`
&&&& {
    svg {
      width: 14px;
      height: 14px;
      fill: var(--button-bg);
    }
}
`;

const DeviceName = styled.span`
  color: var(--center-channel-color);
  font-size: 14px;
  width: 100%;
  text-overflow: ellipsis;
  overflow: hidden;
`;

const DeviceButton = styled.button<{$isCurrentDevice: boolean}>`
&&& {
  display: flex;
  background: ${({$isCurrentDevice}) => $isCurrentDevice ? 'rgba(28, 88, 217, 0.08)' : ''};
  line-height: 20px;
  padding: 8px 20px;
  align-items: center;
  gap: 8px;
}
`;

const DevicesList = styled.ul`
&&&& {
  top: 0;
  left: calc(100% + 4px);
  overflow: auto;
  width: 280px;
  max-height: 164px;
  border-radius: 8px;
}
`;

type DevicesProps = {
    deviceType: string;
    isActive: boolean;
    onToggle: (deviceType: string) => void;
}

const Devices = ({deviceType, isActive, onToggle}: DevicesProps) => {
    const {formatMessage} = useIntl();
    const [currentAudioInputDevice, setCurrentAudioInputDevice] = useState<MediaDeviceInfo | null>(null);
    const [currentAudioOutputDevice, setCurrentAudioOutputDevice] = useState<MediaDeviceInfo | null>(null);
    const [currentVideoInputDevice, setCurrentVideoInputDevice] = useState<MediaDeviceInfo | null>(null);
    const [audioDevices, setAudioDevices] = useState<MediaDevices>({inputs: [], outputs: []});
    const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);

    const handleDeviceClick = (device: MediaDeviceInfo) => {
        const callsClient = getCallsClient();

        if (deviceType === 'audioinput') {
            if (device !== currentAudioInputDevice) {
                callsClient?.setAudioInputDevice(device);
            }
            setCurrentAudioInputDevice(device);
        } else if (deviceType === 'audiooutput') {
            if (device !== currentAudioOutputDevice) {
                callsClient?.setAudioOutputDevice(device);
            }
            setCurrentAudioOutputDevice(device);
        } else if (deviceType === 'videoinput') {
            if (device !== currentVideoInputDevice) {
                callsClient?.setVideoInputDevice(device);
            }
            setCurrentVideoInputDevice(device);
        }

        onToggle(deviceType);
    };

    const handleDeviceChange = (aDevices: MediaDevices, vDevices: MediaDeviceInfo[]) => {
        setAudioDevices(aDevices);
        setVideoDevices(vDevices);

        const callsClient = getCallsClient();
        if (!callsClient) {
            return;
        }

        if (callsClient.currentAudioInputDevice !== currentAudioInputDevice) {
            setCurrentAudioInputDevice(callsClient.currentAudioInputDevice);
        }

        if (callsClient.currentAudioOutputDevice !== currentAudioOutputDevice) {
            setCurrentAudioOutputDevice(callsClient.currentAudioOutputDevice);
        }

        if (callsClient.currentVideoInputDevice !== currentVideoInputDevice) {
            setCurrentVideoInputDevice(callsClient.currentVideoInputDevice);
        }
    };

    useEffect(() => {
        const callsClient = getCallsClient();
        if (!callsClient) {
            // eslint-disable-next-line no-undefined
            return undefined;
        }

        callsClient.on('devicechange', handleDeviceChange);
        setAudioDevices(callsClient.getAudioDevices());
        setVideoDevices(callsClient.getVideoDevices());

        if (deviceType === 'audioinput') {
            setCurrentAudioInputDevice(callsClient.currentAudioInputDevice);
        } else if (deviceType === 'audiooutput') {
            setCurrentAudioOutputDevice(callsClient.currentAudioOutputDevice);
        } else if (deviceType === 'videoinput') {
            setCurrentVideoInputDevice(callsClient.currentVideoInputDevice);
        }

        return () => {
            callsClient.off('devicechange', handleDeviceChange);
        };
    }, []);

    if (deviceType === 'audioinput' && audioDevices.inputs.length === 0) {
        return null;
    }

    if (deviceType === 'audiooutput' && audioDevices.outputs.length === 0) {
        return null;
    }

    if (deviceType === 'videoinput' && videoDevices.length === 0) {
        return null;
    }

    let currentDevice = deviceType === 'audioinput' ? currentAudioInputDevice : currentAudioOutputDevice;
    if (deviceType === 'videoinput') {
        currentDevice = currentVideoInputDevice;
    }
    let Icon = deviceType === 'audioinput' ? UnmutedIcon : SpeakerIcon;
    if (deviceType === 'videoinput') {
        Icon = VideoOnIcon;
    }
    const label = currentDevice?.label || formatMessage({defaultMessage: 'Default'});

    let devices = deviceType === 'audioinput' ?
        audioDevices.inputs?.filter((device) => device.deviceId && device.label) :
        audioDevices.outputs?.filter((device) => device.deviceId && device.label);
    if (deviceType === 'videoinput') {
        devices = videoDevices.filter((device) => device.deviceId && device.label);
    }

    const isDisabled = devices.length === 0;

    let deviceTypeLabel = deviceType === 'audioinput' ?
        formatMessage({defaultMessage: 'Microphone'}) : formatMessage({defaultMessage: 'Audio output'});
    if (deviceType === 'videoinput') {
        deviceTypeLabel = formatMessage({defaultMessage: 'Camera'});
    }

    return (
        <>
            {isActive &&
            <MediaDevicesList
                deviceType={deviceType}
                devices={devices}
                currentDevice={currentDevice}
                onDeviceClick={handleDeviceClick}
            />
            }
            <li
                className='MenuItem'
                role='menuitem'
                aria-label={deviceTypeLabel}
            >
                <DeviceTypeButton
                    id={`calls-popout-${deviceType}-button`}
                    className='style--none'
                    disabled={isDisabled}
                    onClick={() => onToggle(deviceType)}
                    $active={isActive}
                    aria-controls={`calls-popout-${deviceType}s-menu`}
                    aria-expanded={isActive}
                >
                    <DeviceIcon $isDisabled={isDisabled}>
                        <Icon/>
                    </DeviceIcon>

                    <DeviceTypeButtonBody>
                        <DeviceTypeLabel
                            className='MenuItem__primary-text'
                        >
                            {deviceTypeLabel}
                        </DeviceTypeLabel>
                        <DeviceLabel $isDisabled={isDisabled}>
                            {label}
                        </DeviceLabel>
                    </DeviceTypeButtonBody>

                    {devices.length > 0 &&
                    <ShowDevicesIcon $isDisabled={isDisabled}>
                        <ShowMoreIcon/>
                    </ShowDevicesIcon>
                    }
                </DeviceTypeButton>
            </li>
        </>
    );
};

const ShowDevicesIcon = styled.div<{$isDisabled: boolean}>`
&&& {
    svg {
      width: 16px;
      height: 16px;
      fill: ${({$isDisabled}) => $isDisabled ? 'rgba(var(--center-channel-color-rgb), 0.32)' : 'rgba(var(--center-channel-color-rgb), 0.56)'};
    }
}
`;

const DeviceTypeLabel = styled.span`
&&&& {
  padding: 0;
  font-size: 14px;
  line-height: 20px;
}
`;

const DeviceLabel = styled.span<{$isDisabled: boolean}>`
&&& {
  color: ${({$isDisabled}) => $isDisabled ? 'rgba(var(--center-channel-color-rgb), 0.32)' : 'rgba(var(--center-channel-color-rgb), 0.56)'};
  font-size: 12px;
  width: 100%;
  line-height: 16px;
  text-overflow: ellipsis;
  overflow: hidden;
  max-width: 180px;
}
`;

const DeviceTypeButtonBody = styled.div`
&&& {
    display: flex;
    align-items: start;
    flex-direction: column;
    justify-content: center;
    width: 180px;
    gap: 4px;
    padding: 2px 4px;
}
`;

const DeviceIcon = styled.div<{$isDisabled: boolean}>`
&&& {
    svg {
      width: 16px;
      height: 16px;
      fill: ${({$isDisabled}) => $isDisabled ? 'rgba(var(--center-channel-color-rgb), 0.32)' : 'rgba(var(--center-channel-color-rgb), 0.56)'};
    }
    flex-shrink: 0;
}
`;

const DeviceTypeButton = styled.button<{$active: boolean, disabled: boolean}>`
&&& {
    display: flex;
    align-items: start;
    padding: 6px 16px;
    color: ${({disabled}) => disabled ? 'rgba(var(--center-channel-color-rgb), 0.32)' : ''};
    background: ${({$active}) => $active ? 'rgba(var(--center-channel-color-rgb), 0.08)' : ''};
    gap: 16px;
}
`;

type CallSettingsMenuButtonProps = {
    id: string;
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
}

const CallSettingsMenuButton = ({id, icon, label, onClick}: CallSettingsMenuButtonProps) => {
    return (
        <li
            className='MenuItem'
            role='menuitem'
            aria-label={label}
        >
            <CallSettingsMenuButtonWrapper
                id={id}
                className='style--none'
                onClick={onClick}
            >
                {icon}
                {label}
            </CallSettingsMenuButtonWrapper>
        </li>
    );
};

const CallSettingsMenuButtonWrapper = styled.button`
&&& {
  display: flex;
  align-items: center;
  gap: 16px;
  line-height: 20px;
  font-size: 14px;
  padding: 6px 20px 6px 16px;

  svg {
      width: 16px;
      height: 16px;
      fill: rgba(var(--center-channel-color-rgb), 0.56);
  }
}
`;

type CallSettingsProps = {
    onLiveCaptionsToggle: () => void;
    showLiveCaptions: boolean;
}

export function CallSettings({onLiveCaptionsToggle, showLiveCaptions}: CallSettingsProps) {
    const [showAudioInputs, setShowAudioInputs] = useState(false);
    const [showAudioOutputs, setShowAudioOutputs] = useState(false);
    const [showVideoInputs, setShowVideoInputs] = useState(false);
    const isVideoEnabled = useSelector(callsConfig).EnableVideo;
    const showCCButton = useSelector(areLiveCaptionsAvailableInCurrentCall);
    const {formatMessage} = useIntl();
    const dispatch = useDispatch();

    const onToggle = (deviceType: string) => {
        if (deviceType === 'audioinput') {
            setShowAudioInputs(!showAudioInputs);
            setShowAudioOutputs(false);
            setShowVideoInputs(false);
        } else if (deviceType === 'audiooutput') {
            setShowAudioOutputs(!showAudioOutputs);
            setShowAudioInputs(false);
            setShowVideoInputs(false);
        } else if (deviceType === 'videoinput') {
            setShowVideoInputs(!showVideoInputs);
            setShowAudioInputs(false);
            setShowAudioOutputs(false);
        }
    };

    const onAdditionalSettingsClick = () => {
        dispatch(openCallsUserSettings());
    };

    const showAdditionalSetttingsButton = Boolean(window.WebappUtils.openUserSettings);

    return (
        <div
            className='Menu'
            id='calls-popout-settings-menu'
            role='menu'
        >
            <MenuList
                className='Menu__content dropdown-menu'
                role='menu'
            >
                <Devices
                    deviceType='audiooutput'
                    isActive={showAudioOutputs}
                    onToggle={onToggle}
                />
                <Devices
                    deviceType='audioinput'
                    isActive={showAudioInputs}
                    onToggle={onToggle}
                />
                {isVideoEnabled &&
                <Devices
                    deviceType='videoinput'
                    isActive={showVideoInputs}
                    onToggle={onToggle}
                />
                }

                { (showCCButton || showAdditionalSetttingsButton) && <li className='MenuGroup menu-divider'/>}
                { showCCButton &&
                <>
                    <CallSettingsMenuButton
                        id='calls-popout-cc-button'
                        icon={<CCIcon/>}
                        label={showLiveCaptions ? formatMessage({defaultMessage: 'Hide live captions'}) : formatMessage({defaultMessage: 'Show live captions'})}
                        onClick={onLiveCaptionsToggle}
                    />
                </>
                }
                { showAdditionalSetttingsButton &&
                <CallSettingsMenuButton
                    id='calls-popout-additional-settings-button'
                    icon={<SettingsWheelIcon/>}
                    label={formatMessage({defaultMessage: 'Additional settings'})}
                    onClick={onAdditionalSettingsClick}
                />
                }
            </MenuList>
        </div>
    );
}

const MenuList = styled.ul`
&&& {
    position: absolute;
    width: 280px;
    min-width: 280px;
    top: auto;
    bottom: calc(4px + 100%);
    left: calc(-280px + 100%);
    border-radius: 8px;
    background: var(--center-channel-bg);
    color: var(--center-channel-color);
}
`;

type CallSettingsButtonProps = {
    onLiveCaptionsToggle: () => void;
    showLiveCaptions: boolean;
};

export function CallSettingsButton({onLiveCaptionsToggle, showLiveCaptions}: CallSettingsButtonProps) {
    const [showCallSettings, setShowCallSettings] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const {formatMessage} = useIntl();

    const closeOnBlur = (e: Event) => {
        if (ref && ref.current && e.target && ref.current.contains(e.target as Node)) {
            return;
        }

        setShowCallSettings(false);
    };

    const closeOnEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            setShowCallSettings(false);
        }
    };

    useEffect(() => {
        document.addEventListener('click', closeOnBlur, true);
        document.addEventListener('keyup', closeOnEscape, true);
        return () => {
            document.removeEventListener('click', closeOnBlur, true);
            document.removeEventListener('keyup', closeOnEscape, true);
        };
    }, []);

    const onCCButtonToggle = () => {
        onLiveCaptionsToggle();
        setShowCallSettings(false);
    };

    const toolTipText = formatMessage({defaultMessage: 'More options'});

    return (
        <CallSettingsButtonWrapper
            ref={ref}
        >
            {showCallSettings && (
                <CallSettings
                    onLiveCaptionsToggle={onCCButtonToggle}
                    showLiveCaptions={showLiveCaptions}
                />
            )}
            <ControlsButton
                id='calls-popout-settings-button'
                ariaLabel={toolTipText}
                ariaControls='calls-popout-settings-menu'
                ariaExpanded={showCallSettings}
                onToggle={() => setShowCallSettings(!showCallSettings)}
                icon={
                    <HorizontalDotsIcon
                        style={{width: '20px', height: '20px'}}
                    />
                }
                tooltipText={toolTipText}
                bgColor={showCallSettings ? 'white' : ''}
                bgColorHover={showCallSettings ? 'rgba(255, 255, 255, 0.92)' : ''}
                iconFill={showCallSettings ? 'rgba(var(--calls-bg-rgb), 0.80)' : ''}
                iconFillHover={showCallSettings ? 'var(--calls-bg)' : ''}

            />
        </CallSettingsButtonWrapper>
    );
}

const CallSettingsButtonWrapper = styled.div`
  position: relative;
`;
