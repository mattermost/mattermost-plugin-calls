// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {fireEvent, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {mockStore} from 'src/testUtils';

import ICEHostPortOverride from './ice_host_port_override';

describe('ICEHostPortOverride', () => {
    const baseProps = {
        id: 'ICEHostPortOverride',
        label: 'ICE Host Port Override',
        helpText: null,
        value: '8443',
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
                    ICEHostPortOverride: 8443,
                },
                callsConfigEnvOverrides: {},
                rtcdEnabled: false,
            },
            ...storeOverrides,
        });

        return render(
            <Provider store={store}>
                <IntlProvider locale='en'>
                    <ICEHostPortOverride
                        {...baseProps}
                        {...props}
                    />
                </IntlProvider>
            </Provider>,
        );
    };

    it('should render correctly with default value', () => {
        renderComponent();

        expect(screen.getByText('ICE Host Port Override')).toBeInTheDocument();
        expect(screen.getByText('(Optional) A port number to be used as an override for host candidates in place of the one used to listen on. Note: this port will apply to both UDP and TCP host candidates.')).toBeInTheDocument();

        const input = screen.getByTestId('ICEHostPortOverridenumber');
        expect(input).toHaveValue(8443);
    });

    it('should call onChange when input value changes', async () => {
        const onChange = jest.fn();
        renderComponent({onChange});

        const input = screen.getByTestId('ICEHostPortOverridenumber');
        await userEvent.clear(input);
        fireEvent.change(input, {target: {value: '9000'}});

        expect(onChange).toHaveBeenCalledWith('ICEHostPortOverride', 9000);
    });

    it('should be disabled when disabled prop is true', () => {
        renderComponent({disabled: true});

        const input = screen.getByTestId('ICEHostPortOverridenumber');
        expect(input).toBeDisabled();
    });

    it('should be disabled when RTCD is enabled', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    ICEHostPortOverride: 8443,
                },
                callsConfigEnvOverrides: {},
                rtcdEnabled: true,
            },
        });

        const input = screen.getByTestId('ICEHostPortOverridenumber');
        expect(input).toBeDisabled();
        expect(screen.getByText('Not applicable when', {exact: false})).toBeInTheDocument();
    });

    it('should show environment override warning when setting is overridden', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    ICEHostPortOverride: 8443,
                },
                callsConfigEnvOverrides: {
                    ICEHostPortOverride: '8443',
                },
                rtcdEnabled: false,
            },
        });

        expect(screen.getByText('This setting has been set through an environment variable. It cannot be changed through the System Console.')).toBeInTheDocument();
        expect(screen.getByTestId('ICEHostPortOverridenumber')).toBeDisabled();
    });
});
