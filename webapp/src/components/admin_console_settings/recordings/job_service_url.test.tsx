// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {fireEvent, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {mockStore} from 'src/testUtils';

import JobServiceURL from './job_service_url';

describe('JobServiceURL', () => {
    const baseProps = {
        id: 'JobServiceURL',
        label: 'Job service URL',
        helpText: null,
        value: 'http://localhost:8086',
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
                    EnableRecordings: true,
                    JobServiceURL: 'http://localhost:8086',
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
                    <JobServiceURL
                        {...baseProps}
                        {...props}
                    />
                </IntlProvider>
            </Provider>,
        );
    };

    it('should render correctly with default value', () => {
        renderComponent();

        expect(screen.getByText('Job service URL')).toBeInTheDocument();
        expect(screen.getByText('The URL pointing to a running calls-offloader job service instance.')).toBeInTheDocument();

        const input = screen.getByTestId('JobServiceURLinput');
        expect(input).toHaveValue('http://localhost:8086');
    });

    it('should call onChange when input value changes', async () => {
        const onChange = jest.fn();
        renderComponent({onChange});

        const input = screen.getByTestId('JobServiceURLinput');
        await userEvent.clear(input);
        fireEvent.change(input, {target: {value: 'http://new-server:8086'}});

        expect(onChange).toHaveBeenCalledWith('JobServiceURL', 'http://new-server:8086');
    });

    it('should be disabled when disabled prop is true', () => {
        renderComponent({disabled: true});

        const input = screen.getByTestId('JobServiceURLinput');
        expect(input).toBeDisabled();
    });

    it('should show environment override warning when setting is overridden', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    EnableRecordings: true,
                    JobServiceURL: 'http://localhost:8086',
                },
                callsConfigEnvOverrides: {
                    JobServiceURL: 'http://localhost:8086',
                },
            },
        });

        expect(screen.getByText('This setting has been set through an environment variable. It cannot be changed through the System Console.')).toBeInTheDocument();
        expect(screen.getByTestId('JobServiceURLinput')).toBeDisabled();
    });

    it('should not render when recordings are disabled', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    EnableRecordings: false,
                    JobServiceURL: 'http://localhost:8086',
                },
                callsConfigEnvOverrides: {},
            },
        });

        expect(screen.queryByText('Job service URL')).not.toBeInTheDocument();
    });

    it('should not render on cloud', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    EnableRecordings: true,
                    JobServiceURL: 'http://localhost:8086',
                },
                callsConfigEnvOverrides: {},
            },
            entities: {
                general: {
                    license: {
                        Cloud: 'true',
                        SkuShortName: 'enterprise',
                    },
                },
            },
        });

        expect(screen.queryByText('Job service URL')).not.toBeInTheDocument();
    });

    it('should not render when not enterprise', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    EnableRecordings: true,
                    JobServiceURL: 'http://localhost:8086',
                },
                callsConfigEnvOverrides: {},
            },
            entities: {
                general: {
                    license: {},
                },
            },
        });

        expect(screen.queryByText('Job service URL')).not.toBeInTheDocument();
    });
});
