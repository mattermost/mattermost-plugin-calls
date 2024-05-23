import React, {useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import CCIcon from 'src/components/icons/cc_icon';
import SettingsWheelIcon from 'src/components/icons/settings_wheel';
import ShowMoreIcon from 'src/components/icons/show_more';
import SpeakerIcon from 'src/components/icons/speaker_icon';
import TickIcon from 'src/components/icons/tick';
import UnmutedIcon from 'src/components/icons/unmuted_icon';
import {areLiveCaptionsAvailableInCurrentCall} from 'src/selectors';
import type {
    AudioDevices,
} from 'src/types/types';
import {getCallsClient} from 'src/utils';
import styled from 'styled-components';

import ControlsButton from './controls_button';

type AudioDevicesListProps = {
    deviceType: string;
    devices: MediaDeviceInfo[];
    currentDevice: MediaDeviceInfo | null;
    onDeviceClick: (device: MediaDeviceInfo) => void;
}

const AudioDevicesList = ({deviceType, devices, currentDevice, onDeviceClick}: AudioDevicesListProps) => {
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
                key={`audio-${deviceType}-device-${device.deviceId}`}
            >
                <AudioDeviceButton
                    className='style--none'
                    onClick={() => onDeviceClick(device)}
                    $isCurrentDevice={isCurrentDevice}
                >
                    <AudioDeviceName>
                        {makeDeviceLabel(device)}
                    </AudioDeviceName>
                    { isCurrentDevice &&
                    <AudioDeviceSelectedIcon>
                        <TickIcon/>
                    </AudioDeviceSelectedIcon>
                    }
                </AudioDeviceButton>
            </li>
        );
    });

    return (
        <div className='Menu'>
            <DevicesList
                id={`calls-popout-audio-${deviceType}s-menu`}
                className='Menu__content dropdown-menu'
            >
                {list}
            </DevicesList>
        </div>
    );
};

const AudioDeviceSelectedIcon = styled.div`
&&&& {
    svg {
      width: 14px;
      height: 14px;
      fill: var(--button-bg);
    }
}
`;

const AudioDeviceName = styled.span`
  color: var(--center-channel-color);
  font-size: 14px;
  width: 100%;
  text-overflow: ellipsis;
  overflow: hidden;
`;

const AudioDeviceButton = styled.button<{$isCurrentDevice: boolean}>`
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
  max-height: calc(100% + 36px);
  border-radius: 8px;
}
`;

type AudioDevicesProps = {
    deviceType: string;
    isActive: boolean;
    onToggle: (deviceType: string) => void;
}

const AudioDevices = ({deviceType, isActive, onToggle}: AudioDevicesProps) => {
    const {formatMessage} = useIntl();
    const [currentAudioInputDevice, setCurrentAudioInputDevice] = useState<MediaDeviceInfo | null>(null);
    const [currentAudioOutputDevice, setCurrentAudioOutputDevice] = useState<MediaDeviceInfo | null>(null);
    const [audioDevices, setAudioDevices] = useState<AudioDevices>({inputs: [], outputs: []});

    const isInput = deviceType === 'input';

    const handleDeviceClick = (device: MediaDeviceInfo) => {
        const callsClient = getCallsClient();

        if (isInput) {
            if (device !== currentAudioInputDevice) {
                callsClient?.setAudioInputDevice(device);
            }
            setCurrentAudioInputDevice(device);
        } else {
            if (device !== currentAudioOutputDevice) {
                callsClient?.setAudioOutputDevice(device);
            }
            setCurrentAudioOutputDevice(device);
        }

        onToggle(deviceType);
    };

    const handleDeviceChange = (devices: AudioDevices) => {
        setAudioDevices(devices);

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
    };

    useEffect(() => {
        const callsClient = getCallsClient();
        if (!callsClient) {
            // eslint-disable-next-line no-undefined
            return undefined;
        }

        callsClient.on('devicechange', handleDeviceChange);
        setAudioDevices(callsClient.getAudioDevices());

        if (isInput) {
            setCurrentAudioInputDevice(callsClient.currentAudioInputDevice);
        } else {
            setCurrentAudioOutputDevice(callsClient.currentAudioOutputDevice);
        }

        return () => {
            callsClient.off('devicechange', handleDeviceChange);
        };
    }, []);

    if (isInput && audioDevices.inputs.length === 0) {
        return null;
    }

    if (!isInput && audioDevices.outputs.length === 0) {
        return null;
    }

    const currentDevice = isInput ? currentAudioInputDevice : currentAudioOutputDevice;
    const DeviceIcon = isInput ? UnmutedIcon : SpeakerIcon;
    const label = currentDevice?.label || formatMessage({defaultMessage: 'Default'});

    const devices = isInput ?
        audioDevices.inputs?.filter((device) => device.deviceId && device.label) :
        audioDevices.outputs?.filter((device) => device.deviceId && device.label);
    const isDisabled = devices.length === 0;

    return (
        <>
            {isActive &&
            <AudioDevicesList
                deviceType={deviceType}
                devices={devices}
                currentDevice={isInput ? currentAudioInputDevice : currentAudioOutputDevice}
                onDeviceClick={handleDeviceClick}
            />
            }
            <li
                className='MenuItem'
            >
                <AudioDeviceTypeButton
                    id={`calls-popout-audio-${deviceType}-button`}
                    className='style--none'
                    disabled={isDisabled}
                    onClick={() => onToggle(deviceType)}
                    $active={isActive}
                >
                    <AudioDeviceIcon $isDisabled={isDisabled}>
                        <DeviceIcon/>
                    </AudioDeviceIcon>

                    <AudioDeviceTypeButtonBody>
                        <AudioDeviceTypeLabel
                            className='MenuItem__primary-text'
                        >
                            {isInput ? formatMessage({defaultMessage: 'Microphone'}) : formatMessage({defaultMessage: 'Audio output'})}
                        </AudioDeviceTypeLabel>
                        <AudioDeviceLabel $isDisabled={isDisabled}>
                            {label}
                        </AudioDeviceLabel>
                    </AudioDeviceTypeButtonBody>

                    {devices.length > 0 &&
                    <ShowDevicesIcon $isDisabled={isDisabled}>
                        <ShowMoreIcon/>
                    </ShowDevicesIcon>
                    }
                </AudioDeviceTypeButton>
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

const AudioDeviceTypeLabel = styled.span`
&&&& {
  padding: 0;
  font-size: 14px;
  line-height: 20px;
}
`;

const AudioDeviceLabel = styled.span<{$isDisabled: boolean}>`
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

const AudioDeviceTypeButtonBody = styled.div`
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

const AudioDeviceIcon = styled.div<{$isDisabled: boolean}>`
&&& {
    svg {
      width: 16px;
      height: 16px;
      fill: ${({$isDisabled}) => $isDisabled ? 'rgba(var(--center-channel-color-rgb), 0.32)' : 'rgba(var(--center-channel-color-rgb), 0.56)'};
    }
    flex-shrink: 0;
}
`;

const AudioDeviceTypeButton = styled.div<{$active: boolean, disabled: boolean}>`
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
    const showCCButton = useSelector(areLiveCaptionsAvailableInCurrentCall);
    const {formatMessage} = useIntl();

    const onToggle = (deviceType: string) => {
        if (deviceType === 'input') {
            setShowAudioInputs(!showAudioInputs);
            setShowAudioOutputs(false);
        } else {
            setShowAudioOutputs(!showAudioOutputs);
            setShowAudioInputs(false);
        }
    };

    return (
        <div className='Menu'>
            <MenuList
                className='Menu__content dropdown-menu'
            >
                <AudioDevices
                    deviceType='output'
                    isActive={showAudioOutputs}
                    onToggle={onToggle}
                />
                <AudioDevices
                    deviceType='input'
                    isActive={showAudioInputs}
                    onToggle={onToggle}
                />
                { showCCButton &&
                <>
                    <li className='MenuGroup menu-divider'/>
                    <CallSettingsMenuButton
                        id='calls-popout-cc-button'
                        icon={<CCIcon/>}
                        label={showLiveCaptions ? formatMessage({defaultMessage: 'Hide live captions'}) : formatMessage({defaultMessage: 'Show live captions'})}
                        onClick={onLiveCaptionsToggle}
                    />
                </>
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
                onToggle={() => setShowCallSettings(!showCallSettings)}
                icon={
                    <SettingsWheelIcon
                        style={{width: '20px', height: '20px'}}
                    />
                }
                tooltipText={formatMessage({defaultMessage: 'Call settings'})}
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
