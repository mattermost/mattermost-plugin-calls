// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {act, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, {useState} from 'react';
import {IntlProvider} from 'react-intl';

import DeviceControl, {DeviceControlProps} from './device_control';

jest.mock('src/components/icons/muted_icon', () => ({__esModule: true, default: () => 'muted-icon'}));
jest.mock('src/components/icons/unmuted_icon', () => ({__esModule: true, default: () => 'unmuted-icon'}));
jest.mock('src/components/icons/video_off_outline', () => ({__esModule: true, default: () => 'video-off-icon'}));
jest.mock('src/components/icons/video_outline', () => ({__esModule: true, default: () => 'video-icon'}));

const makeDevice = (deviceId: string, label: string, kind: MediaDeviceKind = 'videoinput') => ({deviceId, label, kind, groupId: ''}) as MediaDeviceInfo;

const builtIn = makeDevice('cam-1', 'Built-in Camera');
const usb = makeDevice('cam-2', 'USB Camera');
const external = makeDevice('cam-3', 'External Camera');

// Owns the menu state like the widget does, and still reports each change.
function ControlledDeviceControl(props: DeviceControlProps) {
    const [menuOpen, setMenuOpen] = useState(props.menuOpen);
    return (
        <DeviceControl
            {...props}
            menuOpen={menuOpen}
            onMenuOpenChange={(open) => {
                setMenuOpen(open);
                props.onMenuOpenChange(open);
            }}
        />
    );
}

describe('DeviceControl', () => {
    const renderControl = (props: Partial<DeviceControlProps> = {}) => {
        const allProps: DeviceControlProps = {
            id: 'calls-widget-camera',
            kind: 'videoinput',
            active: false,
            status: 'ready',
            onToggle: jest.fn(),
            devices: [builtIn, usb, external],
            selectedDeviceId: usb.deviceId,
            onSelectDevice: jest.fn(),
            menuOpen: false,
            onMenuOpenChange: jest.fn(),
            ...props,
        };
        const result = render(
            <IntlProvider locale='en'>
                <ControlledDeviceControl {...allProps}/>
            </IntlProvider>,
        );
        return {...result, props: allProps};
    };

    const toggleIcon = (name: string) => screen.getByRole('button', {name}).textContent;

    const openMenu = async (name = 'Camera options') => {
        await userEvent.click(screen.getByRole('button', {name}));
        return screen.getByRole('menu', {name});
    };

    test.each([
        ['audioinput', true, 'Microphone', 'Mute', 'Microphone options', 'unmuted-icon'],
        ['audioinput', false, 'Microphone', 'Unmute', 'Microphone options', 'muted-icon'],
        ['videoinput', true, 'Camera', 'Turn off camera', 'Camera options', 'video-icon'],
        ['videoinput', false, 'Camera', 'Turn on camera', 'Camera options', 'video-off-icon'],
    ] as const)('a ready %s with active=%s is named "%s", with "%s" in its tooltip, "%s" and %s', async (kind, active, toggleName, tooltip, menuName, icon) => {
        renderControl({kind, active});

        const toggle = screen.getByRole('button', {name: toggleName});
        expect(toggle).toHaveAttribute('aria-pressed', String(active));
        expect(toggleIcon(toggleName)).toBe(icon);
        expect(screen.getByRole('button', {name: menuName})).toHaveAttribute('aria-expanded', 'false');

        await userEvent.hover(toggle);
        expect(await screen.findByText(tooltip)).toBeInTheDocument();
    });

    test.each([
        ['audioinput', 'blocked', 'Microphone', 'No audio input permissions', 'unmuted-icon'],
        ['audioinput', 'missing', 'Microphone', 'No audio input devices', 'unmuted-icon'],
        ['videoinput', 'blocked', 'Camera', 'No camera permissions', 'video-icon'],
        ['videoinput', 'missing', 'Camera', 'No camera found', 'video-icon'],
    ] as const)('a %s that is %s keeps its name, explains why in its tooltip, and shows the on icon with a badge', async (kind, status, name, tooltip, icon) => {
        const {container} = renderControl({kind, status, active: false, shortcut: 'Ctrl+Shift+Space'});

        const toggle = screen.getByRole('button', {name});
        expect(toggleIcon(name)).toBe(icon);
        expect(container.querySelector('.icon-close-circle')).toBeInTheDocument();

        await userEvent.hover(toggle);
        expect(await screen.findByText(tooltip)).toBeInTheDocument();
        expect(container.ownerDocument.querySelector('.DeviceControl__tooltipSubtext')).toBeInTheDocument();
        expect(screen.queryByText('Space')).not.toBeInTheDocument();
    });

    test('id overrides replace the derived ids', async () => {
        renderControl({kind: 'audioinput', toggleId: 'voice-mute-unmute', chevronId: 'mic-chevron', menuId: 'mic-menu'});

        expect(screen.getByRole('button', {name: 'Microphone'})).toHaveAttribute('id', 'voice-mute-unmute');
        expect(screen.getByRole('button', {name: 'Microphone options'})).toHaveAttribute('id', 'mic-chevron');
        expect(await openMenu('Microphone options')).toHaveAttribute('id', 'mic-menu');
    });

    test('pressing the toggle calls onToggle and leaves the menu closed', async () => {
        const {props} = renderControl();

        await userEvent.click(screen.getByRole('button', {name: 'Camera'}));

        expect(props.onToggle).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    test('the chevron opens a menu that ticks the selected device and focuses it', async () => {
        renderControl();

        const menu = await openMenu();

        expect(screen.getByRole('button', {name: 'Camera options'})).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('button', {name: 'Camera options'})).toHaveAttribute('aria-controls', menu.id);
        const items = screen.getAllByRole('menuitemradio');
        expect(items.map((item) => item.textContent)).toEqual(['Built-in Camera', 'USB Camera', 'External Camera']);
        expect(items.map((item) => item.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
        expect(items[1].querySelector('.DeviceMenu__tick')).toBeInTheDocument();
        expect(items[0].querySelector('.DeviceMenu__tick')).not.toBeInTheDocument();
        expect(items[1]).toHaveFocus();
    });

    test('focuses the first device when none is selected', async () => {
        renderControl({selectedDeviceId: undefined});

        await openMenu();

        expect(screen.getByRole('menuitemradio', {name: 'Built-in Camera'})).toHaveFocus();
    });

    test('arrow keys, Home and End move through the devices and wrap', async () => {
        renderControl();
        await openMenu();

        await userEvent.keyboard('{ArrowDown}');
        expect(screen.getByRole('menuitemradio', {name: 'External Camera'})).toHaveFocus();

        await userEvent.keyboard('{ArrowDown}');
        expect(screen.getByRole('menuitemradio', {name: 'Built-in Camera'})).toHaveFocus();

        await userEvent.keyboard('{ArrowUp}');
        expect(screen.getByRole('menuitemradio', {name: 'External Camera'})).toHaveFocus();

        await userEvent.keyboard('{Home}');
        expect(screen.getByRole('menuitemradio', {name: 'Built-in Camera'})).toHaveFocus();

        await userEvent.keyboard('{End}');
        expect(screen.getByRole('menuitemradio', {name: 'External Camera'})).toHaveFocus();
    });

    test('Escape closes the menu and returns focus to the chevron', async () => {
        renderControl();
        await openMenu();

        await userEvent.keyboard('{Escape}');

        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Camera options'})).toHaveFocus();
        expect(screen.getByRole('button', {name: 'Camera options'})).toHaveAttribute('aria-expanded', 'false');
    });

    test('arrow keys on the chevron open the menu', async () => {
        renderControl();
        screen.getByRole('button', {name: 'Camera options'}).focus();

        await userEvent.keyboard('{ArrowUp}');

        expect(screen.getByRole('menu', {name: 'Camera options'})).toBeInTheDocument();
        expect(screen.getByRole('menuitemradio', {name: 'USB Camera'})).toHaveFocus();
    });

    test('choosing another device selects it, closes the menu and returns focus', async () => {
        const {props} = renderControl();
        await openMenu();

        await userEvent.keyboard('{ArrowDown}{Enter}');

        expect(props.onSelectDevice).toHaveBeenCalledWith(external);
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Camera options'})).toHaveFocus();
    });

    test('choosing the current device does not select it again', async () => {
        const {props} = renderControl();
        await openMenu();

        await userEvent.click(screen.getByRole('menuitemradio', {name: 'USB Camera'}));

        expect(props.onSelectDevice).not.toHaveBeenCalled();
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    test('a click outside closes the menu', async () => {
        renderControl();
        await openMenu();

        await userEvent.click(document.body);

        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    test('disabled turns off both buttons', () => {
        renderControl({disabled: true});

        expect(screen.getByRole('button', {name: 'Camera'})).toBeDisabled();
        expect(screen.getByRole('button', {name: 'Camera options'})).toBeDisabled();
    });

    test.each([
        ['ready', false, true, true],
        ['starting', false, false, false],
        ['blocked', true, true, true],
        ['missing', true, true, true],
    ] as const)('status %s: badge=%s, toggle works=%s, chevron enabled=%s', async (status, badge, toggleWorks, chevronEnabled) => {
        const {container, props} = renderControl({status, active: true});

        const toggle = screen.getByRole('button', {name: 'Camera'});
        await userEvent.click(toggle);

        expect(Boolean(container.querySelector('.icon-close-circle'))).toBe(badge);
        expect(toggle).toHaveAttribute('aria-disabled', String(!toggleWorks));
        expect(props.onToggle).toHaveBeenCalledTimes(toggleWorks ? 1 : 0);
        expect(screen.getByRole('button', {name: 'Camera options'})).toHaveProperty('disabled', !chevronEnabled);
        expect(Boolean(container.querySelector('.DeviceControl--active'))).toBe(status === 'ready');
    });

    test.each([
        ['audioinput', 'Microphone', 'Starting microphone…'],
        ['videoinput', 'Camera', 'Starting camera…'],
    ] as const)('a starting %s stays focusable and says it is starting instead of the label and shortcut', async (kind, name, tooltip) => {
        renderControl({kind, status: 'starting', shortcut: 'Ctrl+Shift+Space'});

        const toggle = screen.getByRole('button', {name});
        expect(toggle).toBeEnabled();
        expect(toggle).toHaveAttribute('aria-busy', 'true');

        act(() => toggle.focus());
        expect(await screen.findByText(tooltip)).toBeInTheDocument();
        expect(screen.queryByText(/^(Unmute|Turn on camera)$/)).not.toBeInTheDocument();
        expect(screen.queryByText('Space')).not.toBeInTheDocument();
    });

    test('a ready device shows its shortcut in the tooltip', async () => {
        renderControl({kind: 'audioinput', shortcut: 'Ctrl+Shift+Space'});

        await userEvent.hover(screen.getByRole('button', {name: 'Microphone'}));

        expect(await screen.findByText('Unmute')).toBeInTheDocument();
        expect(screen.getByText('Space')).toBeInTheDocument();
    });

    test('the chevron is disabled when no device can be selected', () => {
        renderControl({devices: [makeDevice('', '')]});

        expect(screen.getByRole('button', {name: 'Camera'})).toBeEnabled();
        expect(screen.getByRole('button', {name: 'Camera options'})).toBeDisabled();
    });

    test.each([
        ['videoinput', makeDevice('cam-1', ''), 'Camera 1'],
        ['audioinput', makeDevice('mic-1', '', 'audioinput'), 'Microphone 1'],
        ['audioinput', makeDevice('default', 'MacBook Microphone', 'audioinput'), 'Default - MacBook Microphone'],
        ['audioinput', makeDevice('default', 'Default - MacBook Microphone', 'audioinput'), 'Default - MacBook Microphone'],
    ] as const)('%s device %o is listed as "%s"', async (kind, device, label) => {
        renderControl({kind, devices: [device]});

        await openMenu(kind === 'videoinput' ? 'Camera options' : 'Microphone options');

        expect(screen.getByRole('menuitemradio', {name: label})).toBeInTheDocument();
    });

    test('the menu follows menuOpen and reports changes', async () => {
        const props: DeviceControlProps = {
            id: 'calls-widget-camera',
            kind: 'videoinput',
            active: false,
            status: 'ready',
            onToggle: jest.fn(),
            devices: [builtIn, usb],
            onSelectDevice: jest.fn(),
            menuOpen: false,
            onMenuOpenChange: jest.fn(),
        };
        const widget = (menuOpen: boolean) => (
            <IntlProvider locale='en'>
                <DeviceControl
                    {...props}
                    menuOpen={menuOpen}
                />
            </IntlProvider>
        );
        const {rerender} = render(widget(false));
        const onMenuOpenChange = props.onMenuOpenChange;

        await userEvent.click(screen.getByRole('button', {name: 'Camera options'}));
        expect(onMenuOpenChange).toHaveBeenLastCalledWith(true);
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();

        rerender(widget(true));
        expect(screen.getByRole('menu', {name: 'Camera options'})).toBeInTheDocument();

        await userEvent.keyboard('{Escape}');
        expect(onMenuOpenChange).toHaveBeenLastCalledWith(false);
    });

    test('menuRef receives the menu element', async () => {
        const menuRef = jest.fn();
        renderControl({menuRef});

        const menu = await openMenu();

        expect(menuRef).toHaveBeenCalledWith(menu);
    });
});
