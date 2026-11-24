// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {defineMessage, IntlProvider} from 'react-intl';

import DeviceMenu, {DeviceMenuProps} from './device_menu';

const makeDevice = (deviceId: string, label: string) => ({deviceId, label, kind: 'audioinput', groupId: ''}) as MediaDeviceInfo;

const builtIn = makeDevice('mic-1', 'Built-in Mic');
const usb = makeDevice('mic-2', 'USB Mic');

describe('DeviceMenu', () => {
    const renderMenu = (props: Partial<DeviceMenuProps> = {}) => {
        const allProps: DeviceMenuProps = {
            id: 'device-menu',
            label: 'Microphone options',
            devices: [builtIn, usb],
            selectedDeviceId: usb.deviceId,
            onSelect: jest.fn(),
            onClose: jest.fn(),
            ...props,
        };
        render(
            <IntlProvider locale='en'>
                <DeviceMenu {...allProps}/>
            </IntlProvider>,
        );
        return allProps;
    };

    test('ticks and focuses the selected device', () => {
        renderMenu();

        const selected = screen.getByRole('menuitemradio', {name: usb.label});
        expect(selected).toHaveAttribute('aria-checked', 'true');
        expect(selected.querySelector('.DeviceMenu__tick')).toBeInTheDocument();
        expect(selected).toHaveFocus();
        expect(screen.getByRole('menuitemradio', {name: builtIn.label})).toHaveAttribute('aria-checked', 'false');
    });

    test.each([
        ['Escape', '{Escape}', true],
        ['Tab', '{Tab}', false],
    ])('%s closes it, returning focus=%s', async (_, key, returnFocus) => {
        const props = renderMenu();

        await userEvent.keyboard(key);

        expect(props.onClose).toHaveBeenCalledWith(returnFocus);
    });

    test('picking another device selects it and closes with focus returned', async () => {
        const props = renderMenu();

        await userEvent.click(screen.getByRole('menuitemradio', {name: builtIn.label}));

        expect(props.onSelect).toHaveBeenCalledWith(builtIn);
        expect(props.onClose).toHaveBeenCalledWith(true);
    });

    test.each([
        ['numbers unlabeled devices when given a name for them', makeDevice('mic-3', ''), defineMessage({defaultMessage: 'Microphone {number}'}), 'Microphone 1'],
        ['marks the system default', makeDevice('default', 'MacBook Mic'), undefined, 'Default - MacBook Mic'],
    ])('%s', (_, device, unlabeledDevice, name) => {
        renderMenu({devices: [device], unlabeledDevice});

        expect(screen.getByRole('menuitemradio', {name})).toBeInTheDocument();
    });

    test('passes its list element to menuRef', () => {
        const menuRef = jest.fn();
        renderMenu({menuRef});

        expect(menuRef).toHaveBeenCalledWith(screen.getByRole('menu', {name: 'Microphone options'}));
    });
});
