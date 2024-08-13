import React, {forwardRef, useEffect, useImperativeHandle, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import ReactSelect from 'react-select';
import {logErr} from 'src/log';
import styled from 'styled-components';

type SelectOption = {
    label: string;
    value: string;
};

type AudioDevicesSelectionProps = {
    deviceType: string;
    devices: MediaDeviceInfo[];
};

type AudioDevicesSelectionHandle = {
    getOption: () => SelectOption;
};

const AudioDevicesSelection = forwardRef<AudioDevicesSelectionHandle, AudioDevicesSelectionProps>(({deviceType, devices}: AudioDevicesSelectionProps, ref) => {
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

        const defaultDeviceID = deviceType === 'inputs' ?
            window.localStorage.getItem('calls_default_audio_input') :
            window.localStorage.getItem('calls_default_audio_output');

        for (const device of devices) {
            if (device.deviceId === defaultDeviceID) {
                return {
                    label: device.label,
                    value: device.deviceId,
                };
            }
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

const StyledReactSelect = styled(ReactSelect)`
  width: 260px;
`;

const SelectionWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const SelectLabel = styled.label`
  font-size: 14px;
  font-weight: 400;
  line-height: 20px;
  margin: 0;
`;

export default function AudioDevicesSettingsSection() {
    const {formatMessage} = useIntl();
    const [active, setActive] = useState(false);
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

    const title = formatMessage({defaultMessage: 'Audio devices'});
    const description = formatMessage({defaultMessage: 'Set up audio devices to be used for Mattermost calls'});
    const editLabel = formatMessage({defaultMessage: 'Edit'});

    const audioInputsRef = useRef<AudioDevicesSelectionHandle>(null);
    const audioOutputsRef = useRef<AudioDevicesSelectionHandle>(null);

    const handleSave = () => {
        if (audioInputsRef.current) {
            window.localStorage.setItem('calls_default_audio_input', audioInputsRef.current.getOption().value);
        }
        if (audioOutputsRef.current) {
            window.localStorage.setItem('calls_default_audio_output', audioOutputsRef.current.getOption().value);
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

const Description = styled.span`
  margin-top: 8px;
`;

const Fieldset = styled.fieldset`
    display: flex;
    flex-direction: column;
    gap: 16px;
`;
