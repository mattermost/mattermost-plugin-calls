// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {mockStore} from 'src/testUtils';

import EnableRinging from './enable_ringing';

describe('EnableRinging', () => {
    const baseProps = {
        id: 'EnableRinging',
        label: 'Enable call ringing',
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
                    EnableRinging: true,
                },
                callsConfigEnvOverrides: {},
            },
            ...storeOverrides,
        });

        return render(
            <Provider store={store}>
                <IntlProvider locale='en'>
                    <EnableRinging
                        {...baseProps}
                        {...props}
                    />
                </IntlProvider>
            </Provider>,
        );
    };

    it('should render correctly with default value', () => {
        renderComponent();

        expect(screen.getByText('Enable call ringing')).toBeInTheDocument();
        expect(screen.getByText('True')).toBeInTheDocument();
        expect(screen.getByText('False')).toBeInTheDocument();
        expect(screen.getByText('When set to true, ringing functionality is enabled: participants in direct or group messages will receive a desktop alert and a ringing notification when a call is started. Changing this setting requires a plugin restart.')).toBeInTheDocument();

        // True should be checked
        expect(screen.getByTestId('EnableRingingtrue')).toBeChecked();
        expect(screen.getByTestId('EnableRingingfalse')).not.toBeChecked();
    });

    it('should render correctly with false value', () => {
        renderComponent({value: 'false'});

        // False should be checked
        expect(screen.getByTestId('EnableRingingtrue')).not.toBeChecked();
        expect(screen.getByTestId('EnableRingingfalse')).toBeChecked();
    });

    it('should handle boolean false value correctly', () => {
        renderComponent({value: false});

        // False should be checked
        expect(screen.getByTestId('EnableRingingtrue')).not.toBeChecked();
        expect(screen.getByTestId('EnableRingingfalse')).toBeChecked();
    });

    it('should handle overridden false value correctly', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    EnableRinging: false,
                },
                callsConfigEnvOverrides: {
                    EnableRinging: 'false',
                },
            },
        });

        // False should be checked when overridden
        expect(screen.getByTestId('EnableRingingtrue')).not.toBeChecked();
        expect(screen.getByTestId('EnableRingingfalse')).toBeChecked();
        expect(screen.getByTestId('EnableRingingtrue')).toBeDisabled();
        expect(screen.getByTestId('EnableRingingfalse')).toBeDisabled();
    });

    it('should handle undefined value correctly', () => {
        // eslint-disable-next-line no-undefined
        renderComponent({value: undefined});

        // Should default to false when undefined
        expect(screen.getByTestId('EnableRingingtrue')).not.toBeChecked();
        expect(screen.getByTestId('EnableRingingfalse')).toBeChecked();
    });

    it('should call onChange when radio button is clicked', async () => {
        const onChange = jest.fn();
        renderComponent({value: 'true', onChange});

        await userEvent.click(screen.getByTestId('EnableRingingfalse'));
        expect(onChange).toHaveBeenCalledWith('EnableRinging', false);
    });

    it('should be disabled when disabled prop is true', () => {
        renderComponent({disabled: true});

        expect(screen.getByTestId('EnableRingingtrue')).toBeDisabled();
        expect(screen.getByTestId('EnableRingingfalse')).toBeDisabled();
    });

    it('should show environment override warning when setting is overridden', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    EnableRinging: true,
                },
                callsConfigEnvOverrides: {
                    EnableRinging: 'true',
                },
            },
        });

        expect(screen.getByText('This setting has been set through an environment variable. It cannot be changed through the System Console.')).toBeInTheDocument();
        expect(screen.getByTestId('EnableRingingtrue')).toBeDisabled();
        expect(screen.getByTestId('EnableRingingfalse')).toBeDisabled();
    });
});
