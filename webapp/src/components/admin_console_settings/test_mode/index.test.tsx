// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {mockStore} from 'src/testUtils';

import TestMode from './index';

describe('TestMode', () => {
    const baseProps = {
        id: 'DefaultEnabled',
        label: 'Test mode',
        helpText: null,
        value: 'true',
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
                    DefaultEnabled: true,
                },
                callsConfigEnvOverrides: {},
            },
            ...storeOverrides,
        });

        return render(
            <Provider store={store}>
                <IntlProvider locale='en'>
                    <TestMode
                        {...baseProps}
                        {...props}
                    />
                </IntlProvider>
            </Provider>,
        );
    };

    it('should render correctly with default value (off)', () => {
        renderComponent();

        expect(screen.getByText('Test mode')).toBeInTheDocument();
        expect(screen.getByText('On')).toBeInTheDocument();
        expect(screen.getByText('Off')).toBeInTheDocument();
        expect(screen.getByText('When test mode is enabled, only system admins are able to start calls in channels. This allows testing to confirm calls are working as expected.')).toBeInTheDocument();

        // Off should be checked (DefaultEnabled = true => TestMode = off)
        expect(screen.getByTestId('DefaultEnabled_on')).not.toBeChecked();
        expect(screen.getByTestId('DefaultEnabled_off')).toBeChecked();
    });

    it('should render correctly with test mode on', () => {
        renderComponent({value: 'false'});

        // On should be checked (DefaultEnabled = false => TestMode = on)
        expect(screen.getByTestId('DefaultEnabled_on')).toBeChecked();
        expect(screen.getByTestId('DefaultEnabled_off')).not.toBeChecked();
    });

    it('should handle boolean false value correctly', () => {
        renderComponent({value: false});

        // On should be checked (DefaultEnabled = false => TestMode = on)
        expect(screen.getByTestId('DefaultEnabled_on')).toBeChecked();
        expect(screen.getByTestId('DefaultEnabled_off')).not.toBeChecked();
    });

    it('should handle overridden false value correctly', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    DefaultEnabled: false,
                },
                callsConfigEnvOverrides: {
                    DefaultEnabled: 'false',
                },
            },
        });

        // On should be checked when overridden (DefaultEnabled = false => TestMode = on)
        expect(screen.getByTestId('DefaultEnabled_on')).toBeChecked();
        expect(screen.getByTestId('DefaultEnabled_off')).not.toBeChecked();
        expect(screen.getByTestId('DefaultEnabled_on')).toBeDisabled();
        expect(screen.getByTestId('DefaultEnabled_off')).toBeDisabled();
    });

    it('should handle undefined value correctly', () => {
        // eslint-disable-next-line no-undefined
        renderComponent({value: undefined});

        // Should default to test mode on (DefaultEnabled = false) when undefined
        expect(screen.getByTestId('DefaultEnabled_on')).toBeChecked();
        expect(screen.getByTestId('DefaultEnabled_off')).not.toBeChecked();
    });

    it('should call onChange when radio button is clicked', async () => {
        const onChange = jest.fn();
        renderComponent({value: 'true', onChange});

        await userEvent.click(screen.getByTestId('DefaultEnabled_on'));
        expect(onChange).toHaveBeenCalledWith('DefaultEnabled', false);
    });

    it('should be disabled when disabled prop is true', () => {
        renderComponent({disabled: true});

        expect(screen.getByTestId('DefaultEnabled_on')).toBeDisabled();
        expect(screen.getByTestId('DefaultEnabled_off')).toBeDisabled();
    });

    it('should show environment override warning when setting is overridden', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    DefaultEnabled: true,
                },
                callsConfigEnvOverrides: {
                    DefaultEnabled: 'true',
                },
            },
        });

        expect(screen.getByText('This setting has been set through an environment variable. It cannot be changed through the System Console.')).toBeInTheDocument();
        expect(screen.getByTestId('DefaultEnabled_on')).toBeDisabled();
        expect(screen.getByTestId('DefaultEnabled_off')).toBeDisabled();
    });
});
