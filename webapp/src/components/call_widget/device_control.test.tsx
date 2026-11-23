// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {IntlProvider} from 'react-intl';

import DeviceControl, {DeviceControlProps} from './device_control';

const makeDevice = (deviceId: string, label: string, kind: MediaDeviceKind = 'videoinput') => ({deviceId, label, kind, groupId: ''}) as MediaDeviceInfo;

const builtIn = makeDevice('cam-1', 'Built-in Camera');
const usb = makeDevice('cam-2', 'USB Camera');
const external = makeDevice('cam-3', 'External Camera');

describe('DeviceControl', () => {
    const renderControl = (props: Partial<DeviceControlProps> = {}) => {
        const allProps: DeviceControlProps = {
            id: 'calls-widget-camera',
            kind: 'videoinput',
            active: false,
            onToggle: jest.fn(),
            devices: [builtIn, usb, external],
            selectedDeviceId: usb.deviceId,
            onSelectDevice: jest.fn(),
            ...props,
        };
        const result = render(
            <IntlProvider locale='en'>
                <DeviceControl {...allProps}/>
            </IntlProvider>,
        );
        return {...result, props: allProps};
    };

    const openMenu = async (name = 'Camera options') => {
        await userEvent.click(screen.getByRole('button', {name}));
        return screen.getByRole('menu', {name});
    };

    test.each([
        ['audioinput', true, 'Microphone', 'Mute', 'Microphone options'],
        ['audioinput', false, 'Microphone', 'Unmute', 'Microphone options'],
        ['videoinput', true, 'Camera', 'Turn off camera', 'Camera options'],
        ['videoinput', false, 'Camera', 'Turn on camera', 'Camera options'],
    ] as const)('%s with active=%s is named "%s", with "%s" in its tooltip, and "%s"', async (kind, active, toggleName, tooltip, menuName) => {
        renderControl({kind, active});

        const toggle = screen.getByRole('button', {name: toggleName});
        expect(toggle).toHaveAttribute('aria-pressed', String(active));
        expect(screen.getByRole('button', {name: menuName})).toHaveAttribute('aria-expanded', 'false');

        await userEvent.hover(toggle);
        expect(await screen.findByText(tooltip)).toBeInTheDocument();
    });

    test('a toggle label override replaces the tooltip text but not the name', async () => {
        renderControl({kind: 'audioinput', toggleLabel: 'No audio input devices'});

        const toggle = screen.getByRole('button', {name: 'Microphone'});
        await userEvent.hover(toggle);
        expect(await screen.findByText('No audio input devices')).toBeInTheDocument();
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
        expect(items[1].querySelector('.DeviceControl__tick')).toBeInTheDocument();
        expect(items[0].querySelector('.DeviceControl__tick')).not.toBeInTheDocument();
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

    test('a controlled menu follows menuOpen and reports changes', async () => {
        const onMenuOpenChange = jest.fn();
        const {rerender, props} = renderControl({menuOpen: false, onMenuOpenChange});

        await userEvent.click(screen.getByRole('button', {name: 'Camera options'}));
        expect(onMenuOpenChange).toHaveBeenLastCalledWith(true);
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();

        rerender(
            <IntlProvider locale='en'>
                <DeviceControl
                    {...props}
                    menuOpen={true}
                />
            </IntlProvider>,
        );
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
