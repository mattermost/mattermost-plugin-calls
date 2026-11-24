// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import './device_control.scss';

import classNames from 'classnames';
import React, {useEffect, useRef, useState} from 'react';
import {Overlay} from 'react-bootstrap';
import {defineMessage, MessageDescriptor, useIntl} from 'react-intl';
import type {DeviceStatus} from 'src/clients/call';
import CompassIcon from 'src/components/icons/compassIcon';
import MutedIcon from 'src/components/icons/muted_icon';
import UnmutedIcon from 'src/components/icons/unmuted_icon';
import VideoOffOutlineIcon from 'src/components/icons/video_off_outline';
import VideoOutlineIcon from 'src/components/icons/video_outline';
import {StyledTooltip} from 'src/components/shared';
import Shortcut from 'src/components/shortcut';
import {CallAlertConfigs} from 'src/constants';

import DeviceMenu from './device_menu';
import {getSelectableDevices} from './device_selection';
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

    // Picks the tooltip and icon. The accessible name stays "Microphone" or "Camera".
    status: DeviceStatus;
    onToggle: () => void;
    devices: MediaDeviceInfo[];
    selectedDeviceId?: string;
    onSelectDevice: (device: MediaDeviceInfo) => void;
    disabled?: boolean;

    // Only shown while the device is ready.
    shortcut?: string;
    menuOpen: boolean;
    onMenuOpenChange: (open: boolean) => void;
    menuRef?: (el: HTMLUListElement | null) => void;
    className?: string;
};

type TooltipTarget = 'toggle' | 'chevron' | null;

type IconComponent = React.ComponentType;

type TooltipMessages = {
    text: MessageDescriptor;
    subtext: MessageDescriptor;
};

type KindDisplay = {
    name: MessageDescriptor;
    menuLabel: MessageDescriptor;

    // Browsers hide labels until the user grants access, so unlabeled devices get a numbered name.
    unlabeledDevice: MessageDescriptor;
    starting: MessageDescriptor;
    turnOn: MessageDescriptor;
    turnOff: MessageDescriptor;
    blocked: TooltipMessages;
    missing: TooltipMessages;
    OnIcon: IconComponent;
    OffIcon: IconComponent;
};

const KIND_DISPLAY: Record<DeviceControlKind, KindDisplay> = {
    audioinput: {
        name: defineMessage({defaultMessage: 'Microphone'}),
        menuLabel: defineMessage({defaultMessage: 'Microphone options'}),
        unlabeledDevice: defineMessage({defaultMessage: 'Microphone {number}'}),
        starting: defineMessage({defaultMessage: 'Starting microphone…'}),
        turnOn: defineMessage({defaultMessage: 'Unmute'}),
        turnOff: defineMessage({defaultMessage: 'Mute'}),
        blocked: {
            text: CallAlertConfigs.missingAudioInputPermissions.tooltipText!,
            subtext: CallAlertConfigs.missingAudioInputPermissions.tooltipSubtext!,
        },
        missing: {
            text: CallAlertConfigs.missingAudioInput.tooltipText!,
            subtext: CallAlertConfigs.missingAudioInput.tooltipSubtext!,
        },
        OnIcon: UnmutedIcon,
        OffIcon: MutedIcon,
    },
    videoinput: {
        name: defineMessage({defaultMessage: 'Camera'}),
        menuLabel: defineMessage({defaultMessage: 'Camera options'}),
        unlabeledDevice: defineMessage({defaultMessage: 'Camera {number}'}),
        starting: defineMessage({defaultMessage: 'Starting camera…'}),
        turnOn: defineMessage({defaultMessage: 'Turn on camera'}),
        turnOff: defineMessage({defaultMessage: 'Turn off camera'}),
        blocked: {
            text: CallAlertConfigs.cameraPermissionDenied.tooltipText!,
            subtext: CallAlertConfigs.cameraPermissionDenied.tooltipSubtext!,
        },
        missing: {
            text: CallAlertConfigs.cameraNotFound.tooltipText!,
            subtext: CallAlertConfigs.cameraNotFound.tooltipSubtext!,
        },
        OnIcon: VideoOutlineIcon,
        OffIcon: VideoOffOutlineIcon,
    },
};

type ToggleDisplay = {
    text: MessageDescriptor;
    subtext?: MessageDescriptor;
    Icon: IconComponent;
    unavailable: boolean;
};

const activeIcon = (display: KindDisplay, active: boolean) => (active ? display.OnIcon : display.OffIcon);

// An unavailable device shows its "on" icon under the badge, so the badge isn't drawn over a slash.
const TOGGLE_DISPLAYS: Record<DeviceStatus, (display: KindDisplay, active: boolean) => ToggleDisplay> = {
    starting: (display, active) => ({text: display.starting, Icon: activeIcon(display, active), unavailable: false}),
    ready: (display, active) => ({text: active ? display.turnOff : display.turnOn, Icon: activeIcon(display, active), unavailable: false}),
    blocked: (display) => ({...display.blocked, Icon: display.OnIcon, unavailable: true}),
    missing: (display) => ({...display.missing, Icon: display.OnIcon, unavailable: true}),
};

const getToggleDisplay = (kind: DeviceControlKind, status: DeviceStatus, active: boolean): ToggleDisplay =>
    TOGGLE_DISPLAYS[status](KIND_DISPLAY[kind], active);

export default function DeviceControl(props: DeviceControlProps) {
    const {formatMessage} = useIntl();
    const [tooltipTarget, setTooltipTarget] = useState<TooltipTarget>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const toggleRef = useRef<HTMLButtonElement>(null);
    const chevronRef = useRef<HTMLButtonElement>(null);

    const {status} = props;
    const starting = status === 'starting';
    const toggleDisabled = props.disabled || starting;
    const kindDisplay = KIND_DISPLAY[props.kind];
    const toggleDisplay = getToggleDisplay(props.kind, status, props.active);

    // Switching while starting would race the setup.
    const devices = getSelectableDevices(props.devices);
    const menuDisabled = toggleDisabled || devices.length === 0;
    const menuOpen = !menuDisabled && props.menuOpen;

    const toggleName = formatMessage(kindDisplay.name);
    const menuLabel = formatMessage(kindDisplay.menuLabel);
    const menuID = props.menuId ?? `${props.id}-menu`;

    const closeMenu = (returnFocus: boolean) => {
        props.onMenuOpenChange(false);
        if (returnFocus) {
            chevronRef.current?.focus();
        }
    };

    const closeMenuRef = useRef(closeMenu);
    closeMenuRef.current = closeMenu;

    useEffect(() => {
        if (!menuOpen) {
            return undefined;
        }

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

    const onChevronKeyDown = (e: React.KeyboardEvent) => {
        if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !menuDisabled) {
            e.preventDefault();
            props.onMenuOpenChange(true);
        }
    };

    const renderTooltip = (target: TooltipTarget, ref: React.RefObject<HTMLButtonElement>, text: string, subtext?: string, shortcut?: string) => (
        <Overlay
            target={ref.current as HTMLButtonElement}
            show={tooltipTarget === target && !menuOpen}
            placement='top'
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
                'DeviceControl--active': props.active && status === 'ready',
                'DeviceControl--disabled': toggleDisabled,
            }, props.className)}
            data-status={status}
        >
            <button
                ref={toggleRef}
                id={props.toggleId ?? `${props.id}-toggle`}
                type='button'
                className='DeviceControl__toggle'
                aria-label={toggleName}
                aria-pressed={props.active}

                // Focusable while starting, so the hover and focus tooltip can say why it can't be used yet.
                aria-disabled={starting}
                aria-busy={starting}
                disabled={props.disabled}
                onClick={starting ? undefined : props.onToggle}
                onFocus={() => setTooltipTarget('toggle')}
                onBlur={() => setTooltipTarget(null)}
                onMouseEnter={() => setTooltipTarget('toggle')}
                onMouseLeave={() => setTooltipTarget(null)}
            >
                <UnavailableIconWrapper
                    icon={<toggleDisplay.Icon/>}
                    unavailable={toggleDisplay.unavailable}
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
                onClick={() => props.onMenuOpenChange(!menuOpen)}
                onKeyDown={onChevronKeyDown}
                onMouseEnter={() => setTooltipTarget('chevron')}
                onMouseLeave={() => setTooltipTarget(null)}
            >
                <CompassIcon icon={menuOpen ? 'chevron-down' : 'chevron-up'}/>
            </button>

            {renderTooltip(
                'toggle',
                toggleRef,
                formatMessage(toggleDisplay.text),
                toggleDisplay.subtext && formatMessage(toggleDisplay.subtext),
                status === 'ready' ? props.shortcut : undefined,
            )}
            {renderTooltip('chevron', chevronRef, menuLabel)}

            {menuOpen &&
                <DeviceMenu
                    id={menuID}
                    label={menuLabel}
                    devices={devices}
                    selectedDeviceId={props.selectedDeviceId}
                    onSelect={props.onSelectDevice}
                    onClose={closeMenu}
                    unlabeledDevice={kindDisplay.unlabeledDevice}
                    className='DeviceControl__menu'
                    menuRef={props.menuRef}
                />
            }
        </div>
    );
}
