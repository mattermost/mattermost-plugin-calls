// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {mockStore} from 'src/testUtils';

import EnableSimulcast from './enable_simulcast';

describe('EnableSimulcast', () => {
    const baseProps = {
        id: 'EnableSimulcast',
        label: 'Enable simulcast for screen sharing (Experimental)',
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
                    EnableSimulcast: true,
                },
                callsConfigEnvOverrides: {},
            },
            ...storeOverrides,
        });

        return render(
            <Provider store={store}>
                <IntlProvider locale='en'>
                    <EnableSimulcast
                        {...baseProps}
                        {...props}
                    />
                </IntlProvider>
            </Provider>,
        );
    };

    it('should render correctly with default value', () => {
        renderComponent();

        expect(screen.getByText('Enable simulcast for screen sharing (Experimental)')).toBeInTheDocument();
        expect(screen.getByText('True')).toBeInTheDocument();
        expect(screen.getByText('False')).toBeInTheDocument();
        expect(screen.getByText('When set to true, simulcast for screen sharing is enabled. This can help to improve screen sharing quality.')).toBeInTheDocument();

        // True should be checked
        expect(screen.getByTestId('EnableSimulcasttrue')).toBeChecked();
        expect(screen.getByTestId('EnableSimulcastfalse')).not.toBeChecked();
    });

    it('should render correctly with false value', () => {
        renderComponent({value: 'false'});

        // False should be checked
        expect(screen.getByTestId('EnableSimulcasttrue')).not.toBeChecked();
        expect(screen.getByTestId('EnableSimulcastfalse')).toBeChecked();
    });

    it('should handle boolean false value correctly', () => {
        renderComponent({value: false});

        // False should be checked
        expect(screen.getByTestId('EnableSimulcasttrue')).not.toBeChecked();
        expect(screen.getByTestId('EnableSimulcastfalse')).toBeChecked();
    });

    it('should handle overridden false value correctly', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    EnableSimulcast: false,
                },
                callsConfigEnvOverrides: {
                    EnableSimulcast: 'false',
                },
            },
        });

        // False should be checked when overridden
        expect(screen.getByTestId('EnableSimulcasttrue')).not.toBeChecked();
        expect(screen.getByTestId('EnableSimulcastfalse')).toBeChecked();
        expect(screen.getByTestId('EnableSimulcasttrue')).toBeDisabled();
        expect(screen.getByTestId('EnableSimulcastfalse')).toBeDisabled();
    });

    it('should handle undefined value correctly', () => {
        // eslint-disable-next-line no-undefined
        renderComponent({value: undefined});

        // Should default to false when undefined
        expect(screen.getByTestId('EnableSimulcasttrue')).not.toBeChecked();
        expect(screen.getByTestId('EnableSimulcastfalse')).toBeChecked();
    });

    it('should call onChange when radio button is clicked', async () => {
        const onChange = jest.fn();
        renderComponent({value: 'true', onChange});

        await userEvent.click(screen.getByTestId('EnableSimulcastfalse'));
        expect(onChange).toHaveBeenCalledWith('EnableSimulcast', false);
    });

    it('should be disabled when disabled prop is true', () => {
        renderComponent({disabled: true});

        expect(screen.getByTestId('EnableSimulcasttrue')).toBeDisabled();
        expect(screen.getByTestId('EnableSimulcastfalse')).toBeDisabled();
    });

    it('should show environment override warning when setting is overridden', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    EnableSimulcast: true,
                },
                callsConfigEnvOverrides: {
                    EnableSimulcast: 'true',
                },
            },
        });

        expect(screen.getByText('This setting has been set through an environment variable. It cannot be changed through the System Console.')).toBeInTheDocument();
        expect(screen.getByTestId('EnableSimulcasttrue')).toBeDisabled();
        expect(screen.getByTestId('EnableSimulcastfalse')).toBeDisabled();
    });
});
