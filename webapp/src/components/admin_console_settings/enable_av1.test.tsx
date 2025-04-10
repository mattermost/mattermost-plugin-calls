// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {mockStore} from 'src/testUtils';

import EnableAV1 from './enable_av1';

describe('EnableAV1', () => {
    const baseProps = {
        id: 'EnableAV1',
        label: 'Enable AV1 codec for screen sharing (Experimental)',
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
                    EnableAV1: true,
                },
                callsConfigEnvOverrides: {},
            },
            ...storeOverrides,
        });

        return render(
            <Provider store={store}>
                <IntlProvider locale='en'>
                    <EnableAV1
                        {...baseProps}
                        {...props}
                    />
                </IntlProvider>
            </Provider>,
        );
    };

    it('should render correctly with default value', () => {
        renderComponent();

        expect(screen.getByText('Enable AV1 codec for screen sharing (Experimental)')).toBeInTheDocument();
        expect(screen.getByText('True')).toBeInTheDocument();
        expect(screen.getByText('False')).toBeInTheDocument();
        expect(screen.getByText('When set to true it enables using the AV1 codec to encode screen sharing tracks. This can result in improved screen sharing quality for clients that support it. Note: this setting won\'t apply when EnableSimulcast is true.')).toBeInTheDocument();

        // True should be checked
        expect(screen.getByTestId('EnableAV1true')).toBeChecked();
        expect(screen.getByTestId('EnableAV1false')).not.toBeChecked();
    });

    it('should render correctly with false value', () => {
        renderComponent({value: 'false'});

        // False should be checked
        expect(screen.getByTestId('EnableAV1true')).not.toBeChecked();
        expect(screen.getByTestId('EnableAV1false')).toBeChecked();
    });

    it('should handle boolean false value correctly', () => {
        renderComponent({value: false});

        // False should be checked
        expect(screen.getByTestId('EnableAV1true')).not.toBeChecked();
        expect(screen.getByTestId('EnableAV1false')).toBeChecked();
    });

    it('should handle overridden false value correctly', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    EnableAV1: false,
                },
                callsConfigEnvOverrides: {
                    EnableAV1: 'false',
                },
            },
        });

        // False should be checked when overridden
        expect(screen.getByTestId('EnableAV1true')).not.toBeChecked();
        expect(screen.getByTestId('EnableAV1false')).toBeChecked();
        expect(screen.getByTestId('EnableAV1true')).toBeDisabled();
        expect(screen.getByTestId('EnableAV1false')).toBeDisabled();
    });

    it('should handle undefined value correctly', () => {
        // eslint-disable-next-line no-undefined
        renderComponent({value: undefined});

        // Should default to false when undefined
        expect(screen.getByTestId('EnableAV1true')).not.toBeChecked();
        expect(screen.getByTestId('EnableAV1false')).toBeChecked();
    });

    it('should call onChange when radio button is clicked', async () => {
        const onChange = jest.fn();
        renderComponent({value: 'true', onChange});

        await userEvent.click(screen.getByTestId('EnableAV1false'));
        expect(onChange).toHaveBeenCalledWith('EnableAV1', false);
    });

    it('should be disabled when disabled prop is true', () => {
        renderComponent({disabled: true});

        expect(screen.getByTestId('EnableAV1true')).toBeDisabled();
        expect(screen.getByTestId('EnableAV1false')).toBeDisabled();
    });

    it('should show environment override warning when setting is overridden', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    EnableAV1: true,
                },
                callsConfigEnvOverrides: {
                    EnableAV1: 'true',
                },
            },
        });

        expect(screen.getByText('This setting has been set through an environment variable. It cannot be changed through the System Console.')).toBeInTheDocument();
        expect(screen.getByTestId('EnableAV1true')).toBeDisabled();
        expect(screen.getByTestId('EnableAV1false')).toBeDisabled();
    });
});
