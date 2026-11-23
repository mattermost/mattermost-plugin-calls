// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import './device_control.scss';

import classNames from 'classnames';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Overlay, OverlayProps} from 'react-bootstrap';
import {IntlShape, useIntl} from 'react-intl';
import CompassIcon from 'src/components/icons/compassIcon';
import MutedIcon from 'src/components/icons/muted_icon';
import TickIcon from 'src/components/icons/tick';
import UnmutedIcon from 'src/components/icons/unmuted_icon';
import VideoOffOutlineIcon from 'src/components/icons/video_off_outline';
import VideoOutlineIcon from 'src/components/icons/video_outline';
import {StyledTooltip} from 'src/components/shared';
import Shortcut from 'src/components/shortcut';

import UnavailableIconWrapper from './unavailable_icon_wrapper';

export type DeviceControlKind = 'audioinput' | 'videoinput';

export type DeviceControlProps = {
    id: string;

    // Override the ids derived from `id`, e.g. to keep ids that existing selectors rely on.
    toggleId?: string;
    chevronId?: string;
    menuId?: string;
    kind: DeviceControlKind;

    // Mic unmuted or camera on. Drives aria-pressed and the "on" styling.
    active: boolean;
    onToggle?: () => void;
    devices: MediaDeviceInfo[];
    selectedDeviceId?: string;
    onSelectDevice: (device: MediaDeviceInfo) => void;
    disabled?: boolean;
    unavailable?: boolean;
    icon?: React.ReactNode;

    // Tooltip text for the toggle. The accessible name stays "Microphone" or "Camera".
    toggleLabel?: string;
    tooltipSubtext?: string;
    tooltipPosition?: OverlayProps['placement'];
    shortcut?: string;

    // Pass both to control the menu from outside, e.g. to keep one widget menu open at a time.
    menuOpen?: boolean;
    onMenuOpenChange?: (open: boolean) => void;
    menuRef?: (el: HTMLUListElement | null) => void;
};

type TooltipTarget = 'toggle' | 'chevron' | null;

const getDefaultToggleLabel = (kind: DeviceControlKind, active: boolean, formatMessage: IntlShape['formatMessage']) => {
    switch (kind) {
    case 'audioinput':
        return active ? formatMessage({defaultMessage: 'Mute'}) : formatMessage({defaultMessage: 'Unmute'});
    case 'videoinput':
        return active ? formatMessage({defaultMessage: 'Turn off camera'}) : formatMessage({defaultMessage: 'Turn on camera'});
    default: {
        const unhandled: never = kind;
        return unhandled;
    }
    }
};

const getToggleName = (kind: DeviceControlKind, formatMessage: IntlShape['formatMessage']) => {
    switch (kind) {
    case 'audioinput':
        return formatMessage({defaultMessage: 'Microphone'});
    case 'videoinput':
        return formatMessage({defaultMessage: 'Camera'});
    default: {
        const unhandled: never = kind;
        return unhandled;
    }
    }
};

const getMenuLabel = (kind: DeviceControlKind, formatMessage: IntlShape['formatMessage']) => {
    switch (kind) {
    case 'audioinput':
        return formatMessage({defaultMessage: 'Microphone options'});
    case 'videoinput':
        return formatMessage({defaultMessage: 'Camera options'});
    default: {
        const unhandled: never = kind;
        return unhandled;
    }
    }
};

const getDefaultIcon = (kind: DeviceControlKind, active: boolean) => {
    switch (kind) {
    case 'audioinput':
        return active ? <UnmutedIcon/> : <MutedIcon/>;
    case 'videoinput':
        return active ? <VideoOutlineIcon/> : <VideoOffOutlineIcon/>;
    default: {
        const unhandled: never = kind;
        return unhandled;
    }
    }
};

// Browsers hide labels until the user grants access, so unlabeled devices get a numbered name.
export const getDeviceLabel = (kind: DeviceControlKind, device: MediaDeviceInfo, index: number, formatMessage: IntlShape['formatMessage']) => {
    if (!device.label) {
        switch (kind) {
        case 'audioinput':
            return formatMessage({defaultMessage: 'Microphone {number}'}, {number: index + 1});
        case 'videoinput':
            return formatMessage({defaultMessage: 'Camera {number}'}, {number: index + 1});
        default: {
            const unhandled: never = kind;
            return unhandled;
        }
        }
    }

    // The system default device, not the default the client saves in local storage.
    if (device.deviceId.startsWith('default') && !device.label.startsWith('Default')) {
        return formatMessage({defaultMessage: 'Default - {deviceLabel}'}, {deviceLabel: device.label});
    }

    return device.label;
};

// Without a chosen device the browser captures from its system default: the "default"
// entry where it lists one (Chrome), otherwise the first device.
export function getSelectedAudioInputId(devices: MediaDeviceInfo[], current?: MediaDeviceInfo | null): string | undefined {
    const byId = current && devices.find((device) => device.deviceId === current.deviceId);
    const byLabel = current?.label ? devices.find((device) => device.label === current.label) : undefined;
    const systemDefault = devices.find((device) => device.deviceId === 'default');
    return (byId || byLabel || systemDefault || devices[0])?.deviceId;
}

export default function DeviceControl(props: DeviceControlProps) {
    const {formatMessage} = useIntl();
    const [internalMenuOpen, setInternalMenuOpen] = useState(false);
    const [tooltipTarget, setTooltipTarget] = useState<TooltipTarget>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const toggleRef = useRef<HTMLButtonElement>(null);
    const chevronRef = useRef<HTMLButtonElement>(null);
    const menuListRef = useRef<HTMLUListElement | null>(null);

    // Devices without an ID can't be selected exactly.
    const devices = props.devices.filter((device) => device.deviceId);
    const menuDisabled = props.disabled || devices.length === 0;
    const menuOpen = !menuDisabled && (props.menuOpen ?? internalMenuOpen);

    const toggleName = getToggleName(props.kind, formatMessage);
    const toggleLabel = props.toggleLabel ?? getDefaultToggleLabel(props.kind, props.active, formatMessage);
    const menuLabel = getMenuLabel(props.kind, formatMessage);
    const menuID = props.menuId ?? `${props.id}-menu`;

    const setMenuOpen = (open: boolean) => {
        setInternalMenuOpen(open);
        props.onMenuOpenChange?.(open);
    };

    const closeMenu = (returnFocus: boolean) => {
        setMenuOpen(false);
        if (returnFocus) {
            chevronRef.current?.focus();
        }
    };

    const closeMenuRef = useRef(closeMenu);
    closeMenuRef.current = closeMenu;

    const getMenuItems = () => Array.from(menuListRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []);

    useEffect(() => {
        if (!menuOpen) {
            return undefined;
        }

        const items = getMenuItems();
        const selected = items.find((item) => item.getAttribute('aria-checked') === 'true');
        (selected ?? items[0])?.focus();

        const closeOnOutsideClick = (e: MouseEvent) => {
            if (rootRef.current && e.target instanceof Node && rootRef.current.contains(e.target)) {
                return;
            }
            closeMenuRef.current(false);
        };

        document.addEventListener('mousedown', closeOnOutsideClick, true);
        return () => {
            document.removeEventListener('mousedown', closeOnOutsideClick, true);
        };
    }, [menuOpen]);

    const menuRefPropRef = useRef(props.menuRef);
    menuRefPropRef.current = props.menuRef;

    // Stable, so the parent's ref only fires when the menu mounts or unmounts.
    const setMenuListRef = useCallback((el: HTMLUListElement | null) => {
        menuListRef.current = el;
        menuRefPropRef.current?.(el);
    }, []);

    const onChevronKeyDown = (e: React.KeyboardEvent) => {
        if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !menuDisabled) {
            e.preventDefault();
            setMenuOpen(true);
        }
    };

    const onMenuKeyDown = (e: React.KeyboardEvent) => {
        const items = getMenuItems();
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
            closeMenu(true);
            break;
        case 'Tab':
            closeMenu(false);
            break;
        }
    };

    const onDeviceClick = (device: MediaDeviceInfo) => {
        if (device.deviceId !== props.selectedDeviceId) {
            props.onSelectDevice(device);
        }
        closeMenu(true);
    };

    const renderTooltip = (target: TooltipTarget, ref: React.RefObject<HTMLButtonElement>, text: string, subtext?: string, shortcut?: string) => (
        <Overlay
            target={ref.current as HTMLButtonElement}
            show={tooltipTarget === target && !menuOpen}
            placement={props.tooltipPosition || 'top'}
        >
            <StyledTooltip id={`tooltip-${props.id}-${target}`}>
                <div>{text}</div>
                {subtext && <div className='DeviceControl__tooltipSubtext'>{subtext}</div>}
                {shortcut && <Shortcut shortcut={shortcut}/>}
            </StyledTooltip>
        </Overlay>
    );

    return (
        <div
            ref={rootRef}
            className={classNames('DeviceControl', {
                'DeviceControl--active': props.active && !props.unavailable,
                'DeviceControl--disabled': props.disabled,
            })}
        >
            <button
                ref={toggleRef}
                id={props.toggleId ?? `${props.id}-toggle`}
                type='button'
                className='DeviceControl__toggle'
                aria-label={toggleName}
                aria-pressed={props.active}
                disabled={props.disabled}
                onClick={props.onToggle}
                onMouseEnter={() => setTooltipTarget('toggle')}
                onMouseLeave={() => setTooltipTarget(null)}
            >
                <UnavailableIconWrapper
                    icon={props.icon ?? getDefaultIcon(props.kind, props.active)}
                    unavailable={Boolean(props.unavailable)}
                />
            </button>
            <button
                ref={chevronRef}
                id={props.chevronId ?? `${props.id}-chevron`}
                type='button'
                className='DeviceControl__chevron'
                aria-label={menuLabel}
                aria-haspopup='menu'
                aria-expanded={menuOpen}
                aria-controls={menuOpen ? menuID : undefined}
                disabled={menuDisabled}
                onClick={() => setMenuOpen(!menuOpen)}
                onKeyDown={onChevronKeyDown}
                onMouseEnter={() => setTooltipTarget('chevron')}
                onMouseLeave={() => setTooltipTarget(null)}
            >
                <CompassIcon icon={menuOpen ? 'chevron-down' : 'chevron-up'}/>
            </button>

            {renderTooltip('toggle', toggleRef, toggleLabel, props.tooltipSubtext, props.shortcut)}
            {renderTooltip('chevron', chevronRef, menuLabel)}

            {menuOpen &&
                <ul
                    ref={setMenuListRef}
                    id={menuID}
                    className='DeviceControl__menu'
                    role='menu'
                    aria-label={menuLabel}
                    onKeyDown={onMenuKeyDown}
                >
                    {devices.map((device, idx) => {
                        const selected = device.deviceId === props.selectedDeviceId;
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
                                    className={classNames('DeviceControl__item', {'DeviceControl__item--selected': selected})}
                                    onClick={() => onDeviceClick(device)}
                                >
                                    <span className='DeviceControl__itemLabel'>
                                        {getDeviceLabel(props.kind, device, idx, formatMessage)}
                                    </span>
                                    {selected && <TickIcon className='DeviceControl__tick'/>}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            }
        </div>
    );
}
