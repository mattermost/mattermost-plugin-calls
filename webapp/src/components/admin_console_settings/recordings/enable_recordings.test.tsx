// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {mockStore} from 'src/testUtils';

import EnableRecordings from './enable_recordings';

describe('EnableRecordings', () => {
    const baseProps = {
        id: 'EnableRecordings',
        label: 'Enable call recordings',
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
                    EnableRecordings: true,
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
                    <EnableRecordings
                        {...baseProps}
                        {...props}
                    />
                </IntlProvider>
            </Provider>,
        );
    };

    it('should render correctly with default value', () => {
        const store = mockStore({
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    EnableRecordings: true,
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
        });

        render(
            <Provider store={store}>
                <IntlProvider locale='en'>
                    <EnableRecordings {...baseProps}/>
                </IntlProvider>
            </Provider>,
        );

        expect(screen.getByText('Enable call recordings')).toBeInTheDocument();
        expect(screen.getByText('True')).toBeInTheDocument();
        expect(screen.getByText('False')).toBeInTheDocument();
        expect(screen.getByText('(Optional) When set to true, call recordings are enabled.')).toBeInTheDocument();

        // True should be checked
        expect(screen.getByTestId('EnableRecordingstrue')).toBeChecked();
        expect(screen.getByTestId('EnableRecordingsfalse')).not.toBeChecked();
    });

    it('should render correctly with false value', () => {
        renderComponent({value: 'false'});

        // False should be checked
        expect(screen.getByTestId('EnableRecordingstrue')).not.toBeChecked();
        expect(screen.getByTestId('EnableRecordingsfalse')).toBeChecked();
    });

    it('should handle boolean false value correctly', () => {
        renderComponent({value: false});

        // False should be checked
        expect(screen.getByTestId('EnableRecordingstrue')).not.toBeChecked();
        expect(screen.getByTestId('EnableRecordingsfalse')).toBeChecked();
    });

    it('should handle overridden false value correctly', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    EnableRecordings: false,
                },
                callsConfigEnvOverrides: {
                    EnableRecordings: 'false',
                },
            },
        });

        // False should be checked when overridden
        expect(screen.getByTestId('EnableRecordingstrue')).not.toBeChecked();
        expect(screen.getByTestId('EnableRecordingsfalse')).toBeChecked();
        expect(screen.getByTestId('EnableRecordingstrue')).toBeDisabled();
        expect(screen.getByTestId('EnableRecordingsfalse')).toBeDisabled();
    });

    it('should handle undefined value correctly', () => {
        // eslint-disable-next-line no-undefined
        renderComponent({value: undefined});

        // Should default to false when undefined
        expect(screen.getByTestId('EnableRecordingstrue')).not.toBeChecked();
        expect(screen.getByTestId('EnableRecordingsfalse')).toBeChecked();
    });

    it('should call onChange when radio button is clicked', async () => {
        const onChange = jest.fn();
        renderComponent({value: 'true', onChange});

        await userEvent.click(screen.getByTestId('EnableRecordingsfalse'));
        expect(onChange).toHaveBeenCalledWith('EnableRecordings', false);
    });

    it('should be disabled when disabled prop is true', () => {
        renderComponent({disabled: true});

        expect(screen.getByTestId('EnableRecordingstrue')).toBeDisabled();
        expect(screen.getByTestId('EnableRecordingsfalse')).toBeDisabled();
    });

    it('should show environment override warning when setting is overridden', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    EnableRecordings: true,
                },
                callsConfigEnvOverrides: {
                    EnableRecordings: 'true',
                },
            },
        });

        expect(screen.getByText('This setting has been set through an environment variable. It cannot be changed through the System Console.')).toBeInTheDocument();
        expect(screen.getByTestId('EnableRecordingstrue')).toBeDisabled();
        expect(screen.getByTestId('EnableRecordingsfalse')).toBeDisabled();
    });

    it('should not render on cloud', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    EnableRecordings: true,
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

        expect(screen.queryByText('Enable call recordings')).not.toBeInTheDocument();
    });
});
