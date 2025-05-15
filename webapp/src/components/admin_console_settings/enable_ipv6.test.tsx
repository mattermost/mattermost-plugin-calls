// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {mockStore} from 'src/testUtils';

import EnableIPv6 from './enable_ipv6';

describe('EnableIPv6', () => {
    const baseProps = {
        id: 'EnableIPv6',
        label: 'Enable IPv6 support (Experimental)',
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
                    EnableIPv6: true,
                },
                callsConfigEnvOverrides: {},
                rtcdEnabled: false,
            },
            ...storeOverrides,
        });

        return render(
            <Provider store={store}>
                <IntlProvider locale='en'>
                    <EnableIPv6
                        {...baseProps}
                        {...props}
                    />
                </IntlProvider>
            </Provider>,
        );
    };

    it('should render correctly with default value', () => {
        renderComponent();

        expect(screen.getByText('Enable IPv6 support (Experimental)')).toBeInTheDocument();
        expect(screen.getByText('True')).toBeInTheDocument();
        expect(screen.getByText('False')).toBeInTheDocument();
        expect(screen.getByText('When set to true, the RTC service will work in dual-stack mode, listening for IPv6 connections and generating candidates in addition to IPv4 ones.')).toBeInTheDocument();

        // True should be checked
        expect(screen.getByTestId('EnableIPv6true')).toBeChecked();
        expect(screen.getByTestId('EnableIPv6false')).not.toBeChecked();
    });

    it('should render correctly with false value', () => {
        renderComponent({value: 'false'});

        // False should be checked
        expect(screen.getByTestId('EnableIPv6true')).not.toBeChecked();
        expect(screen.getByTestId('EnableIPv6false')).toBeChecked();
    });

    it('should handle boolean false value correctly', () => {
        renderComponent({value: false});

        // False should be checked
        expect(screen.getByTestId('EnableIPv6true')).not.toBeChecked();
        expect(screen.getByTestId('EnableIPv6false')).toBeChecked();
    });

    it('should handle overridden false value correctly', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    EnableIPv6: false,
                },
                callsConfigEnvOverrides: {
                    EnableIPv6: 'false',
                },
                rtcdEnabled: false,
            },
        });

        // False should be checked when overridden
        expect(screen.getByTestId('EnableIPv6true')).not.toBeChecked();
        expect(screen.getByTestId('EnableIPv6false')).toBeChecked();
        expect(screen.getByTestId('EnableIPv6true')).toBeDisabled();
        expect(screen.getByTestId('EnableIPv6false')).toBeDisabled();
    });

    it('should handle undefined value correctly', () => {
        // eslint-disable-next-line no-undefined
        renderComponent({value: undefined});

        // Should default to false when undefined
        expect(screen.getByTestId('EnableIPv6true')).not.toBeChecked();
        expect(screen.getByTestId('EnableIPv6false')).toBeChecked();
    });

    it('should call onChange when radio button is clicked', async () => {
        const onChange = jest.fn();
        renderComponent({value: 'true', onChange});

        await userEvent.click(screen.getByTestId('EnableIPv6false'));
        expect(onChange).toHaveBeenCalledWith('EnableIPv6', false);
    });

    it('should be disabled when disabled prop is true', () => {
        renderComponent({disabled: true});

        expect(screen.getByTestId('EnableIPv6true')).toBeDisabled();
        expect(screen.getByTestId('EnableIPv6false')).toBeDisabled();
    });

    it('should be disabled when RTCD is enabled', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    EnableIPv6: true,
                },
                callsConfigEnvOverrides: {},
                rtcdEnabled: true,
            },
        });

        expect(screen.getByTestId('EnableIPv6true')).toBeDisabled();
        expect(screen.getByTestId('EnableIPv6false')).toBeDisabled();
        expect(screen.getByText('Not applicable when', {exact: false})).toBeInTheDocument();
    });

    it('should show environment override warning when setting is overridden', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    EnableIPv6: true,
                },
                callsConfigEnvOverrides: {
                    EnableIPv6: 'true',
                },
                rtcdEnabled: false,
            },
        });

        expect(screen.getByText('This setting has been set through an environment variable. It cannot be changed through the System Console.')).toBeInTheDocument();
        expect(screen.getByTestId('EnableIPv6true')).toBeDisabled();
        expect(screen.getByTestId('EnableIPv6false')).toBeDisabled();
    });
});
