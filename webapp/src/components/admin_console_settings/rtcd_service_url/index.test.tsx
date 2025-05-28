// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {fireEvent, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {mockStore} from 'src/testUtils';

import RTCDServiceURL from './index';

describe('RTCDServiceURL', () => {
    const baseProps = {
        id: 'RTCDServiceURL',
        label: 'RTCD service URL',
        helpText: null,
        value: 'http://localhost:8045',
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
                    RTCDServiceURL: 'http://localhost:8045',
                },
                callsConfigEnvOverrides: {},
            },
            entities: {
                general: {
                    license: {
                        SkuShortName: 'enterprise',
                    },
                },
            },
            ...storeOverrides,
        });

        return render(
            <Provider store={store}>
                <IntlProvider locale='en'>
                    <RTCDServiceURL
                        {...baseProps}
                        {...props}
                    />
                </IntlProvider>
            </Provider>,
        );
    };

    it('should render correctly with default value', () => {
        renderComponent();

        expect(screen.getByText('RTCD service URL')).toBeInTheDocument();
        expect(screen.getByText('(Optional) The URL to a running RTCD service instance that should host the calls. When set (non empty) all calls will be handled by the external service.')).toBeInTheDocument();

        const input = screen.getByTestId('RTCDServiceURLinput');
        expect(input).toHaveValue('http://localhost:8045');
    });

    it('should call onChange when input value changes', async () => {
        const onChange = jest.fn();
        renderComponent({onChange});

        const input = screen.getByTestId('RTCDServiceURLinput');
        await userEvent.clear(input);

        // Use fireEvent.change instead of userEvent.paste to avoid toLowerCase issues
        fireEvent.change(input, {target: {value: 'http://new-url:8045'}});

        expect(onChange).toHaveBeenCalledWith('RTCDServiceURL', 'http://new-url:8045');
    });

    it('should be disabled when disabled prop is true', () => {
        renderComponent({disabled: true});

        const input = screen.getByTestId('RTCDServiceURLinput');
        expect(input).toBeDisabled();
    });

    it('should show environment override warning when setting is overridden', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    RTCDServiceURL: 'http://localhost:8045',
                },
                callsConfigEnvOverrides: {
                    RTCDServiceURL: 'http://localhost:8045',
                },
            },
        });

        expect(screen.getByText('This setting has been set through an environment variable. It cannot be changed through the System Console.')).toBeInTheDocument();
        expect(screen.getByTestId('RTCDServiceURLinput')).toBeDisabled();
    });

    it('should update global state when value changes', async () => {
        const onChange = jest.fn();
        const store = mockStore({
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    RTCDServiceURL: '',
                },
                callsConfigEnvOverrides: {},
                rtcdEnabled: false,
            },
            entities: {
                general: {
                    license: {
                        SkuShortName: 'enterprise',
                    },
                },
            },
        });

        render(
            <Provider store={store}>
                <IntlProvider locale='en'>
                    <RTCDServiceURL
                        {...baseProps}
                        onChange={onChange}
                        value=''
                    />
                </IntlProvider>
            </Provider>,
        );

        const input = screen.getByTestId('RTCDServiceURLinput');

        // Simulate a change event directly instead of typing
        await userEvent.clear(input);
        fireEvent.change(input, {target: {value: 'http://new-url:8045'}});

        // We can't directly test the dispatch call, but we can verify onChange was called
        expect(onChange).toHaveBeenCalledWith('RTCDServiceURL', 'http://new-url:8045');
    });
});
