// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {fireEvent, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {mockStore} from 'src/testUtils';

import ICEServersConfigs from './ice_servers_configs';

describe('ICEServersConfigs', () => {
    const baseProps = {
        id: 'ICEServersConfigs',
        label: 'ICE Servers Configurations',
        helpText: null,
        value: '[]',
        disabled: false,
        setByEnv: false,
        onChange: jest.fn(),
        saveAction: jest.fn(),
        registerSaveAction: jest.fn(),
        unRegisterSaveAction: jest.fn(),
        setSaveNeeded: jest.fn(),
        config: {},
        license: {},
        cancelSubmit: () => {},
        showConfirm: false,
    };

    const renderComponent = (props = {}, storeOverrides = {}) => {
        const store = mockStore({
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    ICEServersConfigs: [],
                },
                callsConfigEnvOverrides: {},
            },
            ...storeOverrides,
        });

        return render(
            <Provider store={store}>
                <IntlProvider locale='en'>
                    <ICEServersConfigs
                        {...baseProps}
                        {...props}
                    />
                </IntlProvider>
            </Provider>,
        );
    };

    it('should render correctly with default value', () => {
        renderComponent();

        expect(screen.getByText('ICE Servers Configurations')).toBeInTheDocument();
        expect(screen.getByText('(Optional) A list of ICE servers (STUN/TURN) configurations to use. This field should contain a valid JSON array.')).toBeInTheDocument();

        const textarea = screen.getByTestId('ICEServersConfigsinput');
        expect(textarea).toHaveValue('[]');
    });

    it('should call onChange when textarea value changes', async () => {
        const onChange = jest.fn();
        renderComponent({onChange});

        const textarea = screen.getByTestId('ICEServersConfigsinput');
        await userEvent.clear(textarea);

        const newValue = '[{"urls": ["stun:stun.example.com:3478"]}]';
        fireEvent.change(textarea, {target: {value: newValue}});

        expect(onChange).toHaveBeenCalledWith('ICEServersConfigs', newValue);
    });

    it('should be disabled when disabled prop is true', () => {
        renderComponent({disabled: true});

        const textarea = screen.getByTestId('ICEServersConfigsinput');
        expect(textarea).toBeDisabled();
    });

    it('should show environment override warning when setting is overridden', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    ICEServersConfigs: [{urls: ['stun:stun.example.com:3478']}],
                },
                callsConfigEnvOverrides: {
                    ICEServersConfigs: '[{"urls": ["stun:stun.example.com:3478"]}]',
                },
            },
        });

        expect(screen.getByText('This setting has been set through an environment variable. It cannot be changed through the System Console.')).toBeInTheDocument();

        const textarea = screen.getByTestId('ICEServersConfigsinput');
        expect(textarea).toBeDisabled();
        expect(textarea).toHaveValue(JSON.stringify([{urls: ['stun:stun.example.com:3478']}], null, 2));
    });
});
