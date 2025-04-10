// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {mockStore} from 'src/testUtils';

import ServerSideTURN from './server_side_turn';

describe('ServerSideTURN', () => {
    const baseProps = {
        id: 'ServerSideTURN',
        label: 'Server Side TURN',
        helpText: null,
        value: 'on',
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
                    ServerSideTURN: true,
                },
                callsConfigEnvOverrides: {},
                rtcdEnabled: false,
            },
            ...storeOverrides,
        });

        return render(
            <Provider store={store}>
                <IntlProvider locale='en'>
                    <ServerSideTURN
                        {...baseProps}
                        {...props}
                    />
                </IntlProvider>
            </Provider>,
        );
    };

    it('should render correctly with default value', () => {
        renderComponent();

        expect(screen.getByText('Server Side TURN')).toBeInTheDocument();
        expect(screen.getByText('(Optional) When enabled, it will pass and use the configured TURN candidates to server initiated connections.')).toBeInTheDocument();
        expect(screen.getByText('On')).toBeInTheDocument();
        expect(screen.getByText('Off')).toBeInTheDocument();

        // On should be checked
        expect(screen.getByTestId('ServerSideTURN_on')).toBeChecked();
        expect(screen.getByTestId('ServerSideTURN_off')).not.toBeChecked();
    });

    it('should render correctly with off value', () => {
        renderComponent({value: 'off'});

        // Off should be checked
        expect(screen.getByTestId('ServerSideTURN_on')).not.toBeChecked();
        expect(screen.getByTestId('ServerSideTURN_off')).toBeChecked();
    });

    it('should handle boolean false value correctly', () => {
        renderComponent({value: false});

        // Off should be checked
        expect(screen.getByTestId('ServerSideTURN_on')).not.toBeChecked();
        expect(screen.getByTestId('ServerSideTURN_off')).toBeChecked();
    });

    it('should handle overridden false value correctly', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    ServerSideTURN: false,
                },
                callsConfigEnvOverrides: {
                    ServerSideTURN: 'false',
                },
                rtcdEnabled: false,
            },
        });

        // Off should be checked when overridden
        expect(screen.getByTestId('ServerSideTURN_on')).not.toBeChecked();
        expect(screen.getByTestId('ServerSideTURN_off')).toBeChecked();
        expect(screen.getByTestId('ServerSideTURN_on')).toBeDisabled();
        expect(screen.getByTestId('ServerSideTURN_off')).toBeDisabled();
    });

    it('should handle undefined value correctly', () => {
        // eslint-disable-next-line no-undefined
        renderComponent({value: undefined});

        // Should default to off when undefined
        expect(screen.getByTestId('ServerSideTURN_on')).not.toBeChecked();
        expect(screen.getByTestId('ServerSideTURN_off')).toBeChecked();
    });

    it('should call onChange when radio button is clicked', async () => {
        const onChange = jest.fn();
        renderComponent({value: 'on', onChange});

        await userEvent.click(screen.getByTestId('ServerSideTURN_off'));
        expect(onChange).toHaveBeenCalledWith('ServerSideTURN', false);
    });

    it('should be disabled when disabled prop is true', () => {
        renderComponent({disabled: true});

        expect(screen.getByTestId('ServerSideTURN_on')).toBeDisabled();
        expect(screen.getByTestId('ServerSideTURN_off')).toBeDisabled();
    });

    it('should be disabled when RTCD is enabled', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    ServerSideTURN: true,
                },
                callsConfigEnvOverrides: {},
                rtcdEnabled: true,
            },
        });

        expect(screen.getByTestId('ServerSideTURN_on')).toBeDisabled();
        expect(screen.getByTestId('ServerSideTURN_off')).toBeDisabled();
        expect(screen.getByText('Not applicable when', {exact: false})).toBeInTheDocument();
    });

    it('should show environment override warning when setting is overridden', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    ServerSideTURN: true,
                },
                callsConfigEnvOverrides: {
                    ServerSideTURN: 'true',
                },
                rtcdEnabled: false,
            },
        });

        expect(screen.getByText('This setting has been set through an environment variable. It cannot be changed through the System Console.')).toBeInTheDocument();
        expect(screen.getByTestId('ServerSideTURN_on')).toBeDisabled();
        expect(screen.getByTestId('ServerSideTURN_off')).toBeDisabled();
    });
});
