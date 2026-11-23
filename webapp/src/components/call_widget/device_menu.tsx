// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import './device_menu.scss';

import classNames from 'classnames';
import React, {useCallback, useRef} from 'react';
import {MessageDescriptor, useIntl} from 'react-intl';
import TickIcon from 'src/components/icons/tick';

import {getDeviceLabel} from './device_selection';

export type DeviceMenuProps = {
    id: string;
    label: string;

    // Only devices that can be selected, i.e. with an ID.
    devices: MediaDeviceInfo[];
    selectedDeviceId?: string;
    onSelect: (device: MediaDeviceInfo) => void;

    // The owner closes the menu and, when asked, moves focus back to what opened it.
    onClose: (returnFocus: boolean) => void;

    // Names devices without a label, e.g. "Camera {number}".
    unlabeledDevice?: MessageDescriptor;
    className?: string;
    style?: React.CSSProperties;
    menuRef?: (el: HTMLUListElement | null) => void;
};

const getItems = (list: HTMLUListElement) => Array.from(list.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));

export default function DeviceMenu({id, label, devices, selectedDeviceId, onSelect, onClose, unlabeledDevice, className, style, menuRef}: DeviceMenuProps) {
    const {formatMessage} = useIntl();

    const menuRefRef = useRef(menuRef);
    menuRefRef.current = menuRef;

    // Stable, so it only runs when the menu mounts or unmounts. On mount it focuses the selected device.
    const setListRef = useCallback((el: HTMLUListElement | null) => {
        if (el) {
            const items = getItems(el);
            const selected = items.find((item) => item.getAttribute('aria-checked') === 'true');
            (selected ?? items[0])?.focus();
        }
        menuRefRef.current?.(el);
    }, []);

    const onKeyDown = (e: React.KeyboardEvent<HTMLUListElement>) => {
        const items = getItems(e.currentTarget);
        const current = items.indexOf(document.activeElement as HTMLButtonElement);

        switch (e.key) {
        case 'ArrowDown':
            e.preventDefault();
            items[(current + 1) % items.length]?.focus();
            break;
        case 'ArrowUp':
            e.preventDefault();
            items[((current - 1) + items.length) % items.length]?.focus();
            break;
        case 'Home':
            e.preventDefault();
            items[0]?.focus();
            break;
        case 'End':
            e.preventDefault();
            items[items.length - 1]?.focus();
            break;
        case 'Escape':
            e.preventDefault();
            e.stopPropagation();
            onClose(true);
            break;
        case 'Tab':
            onClose(false);
            break;
        }
    };

    const onDeviceClick = (device: MediaDeviceInfo) => {
        if (device.deviceId !== selectedDeviceId) {
            onSelect(device);
        }
        onClose(true);
    };

    const deviceName = (device: MediaDeviceInfo, index: number) => {
        if (!device.label && unlabeledDevice) {
            return formatMessage(unlabeledDevice, {number: index + 1});
        }
        return getDeviceLabel(device, formatMessage);
    };

    return (
        <ul
            ref={setListRef}
            id={id}
            className={classNames('DeviceMenu', className)}
            style={style}
            role='menu'
            aria-label={label}
            onKeyDown={onKeyDown}
        >
            {devices.map((device, index) => {
                const selected = device.deviceId === selectedDeviceId;
                return (
                    <li
                        key={device.deviceId}
                        role='none'
                    >
                        <button
                            type='button'
                            role='menuitemradio'
                            aria-checked={selected}
                            tabIndex={-1}
                            className={classNames('DeviceMenu__item', {'DeviceMenu__item--selected': selected})}
                            onClick={() => onDeviceClick(device)}
                        >
                            <span className='DeviceMenu__itemLabel'>{deviceName(device, index)}</span>
                            {selected && <TickIcon className='DeviceMenu__tick'/>}
                        </button>
                    </li>
                );
            })}
        </ul>
    );
}
