// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {mockStore} from 'src/testUtils';

import EnableLiveCaptions from './enable_live_captions';

describe('EnableLiveCaptions', () => {
    const baseProps = {
        id: 'EnableLiveCaptions',
        label: 'Enable live captions',
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
                    EnableTranscriptions: true,
                    EnableLiveCaptions: true,
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
                    <EnableLiveCaptions
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
                    EnableTranscriptions: true,
                    EnableLiveCaptions: true,
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
                    <EnableLiveCaptions {...baseProps}/>
                </IntlProvider>
            </Provider>,
        );

        expect(screen.getByText('Enable live captions (Beta)')).toBeInTheDocument();
        expect(screen.getByText('True')).toBeInTheDocument();
        expect(screen.getByText('False')).toBeInTheDocument();
        expect(screen.getByText('(Optional) When set to true, live captions are enabled.')).toBeInTheDocument();

        // True should be checked
        expect(screen.getByTestId('EnableLiveCaptionstrue')).toBeChecked();
        expect(screen.getByTestId('EnableLiveCaptionsfalse')).not.toBeChecked();
    });

    it('should render correctly with false value', () => {
        renderComponent({value: 'false'});

        // False should be checked
        expect(screen.getByTestId('EnableLiveCaptionstrue')).not.toBeChecked();
        expect(screen.getByTestId('EnableLiveCaptionsfalse')).toBeChecked();
    });

    it('should handle boolean false value correctly', () => {
        renderComponent({value: false});

        // False should be checked
        expect(screen.getByTestId('EnableLiveCaptionstrue')).not.toBeChecked();
        expect(screen.getByTestId('EnableLiveCaptionsfalse')).toBeChecked();
    });

    it('should handle overridden false value correctly', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    EnableRecordings: true,
                    EnableTranscriptions: true,
                    EnableLiveCaptions: false,
                },
                callsConfigEnvOverrides: {
                    EnableLiveCaptions: 'false',
                },
            },
        });

        // False should be checked when overridden
        expect(screen.getByTestId('EnableLiveCaptionstrue')).not.toBeChecked();
        expect(screen.getByTestId('EnableLiveCaptionsfalse')).toBeChecked();
        expect(screen.getByTestId('EnableLiveCaptionstrue')).toBeDisabled();
        expect(screen.getByTestId('EnableLiveCaptionsfalse')).toBeDisabled();
    });

    it('should handle undefined value correctly', () => {
        // eslint-disable-next-line no-undefined
        renderComponent({value: undefined});

        // Should default to false when undefined
        expect(screen.getByTestId('EnableLiveCaptionstrue')).not.toBeChecked();
        expect(screen.getByTestId('EnableLiveCaptionsfalse')).toBeChecked();
    });

    it('should call onChange when radio button is clicked', async () => {
        const onChange = jest.fn();
        renderComponent({value: 'true', onChange});

        await userEvent.click(screen.getByTestId('EnableLiveCaptionsfalse'));
        expect(onChange).toHaveBeenCalledWith('EnableLiveCaptions', false);
    });

    it('should be disabled when disabled prop is true', () => {
        renderComponent({disabled: true});

        expect(screen.getByTestId('EnableLiveCaptionstrue')).toBeDisabled();
        expect(screen.getByTestId('EnableLiveCaptionsfalse')).toBeDisabled();
    });

    it('should show environment override warning when setting is overridden', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    EnableRecordings: true,
                    EnableTranscriptions: true,
                    EnableLiveCaptions: true,
                },
                callsConfigEnvOverrides: {
                    EnableLiveCaptions: 'true',
                },
            },
        });

        expect(screen.getByText('This setting has been set through an environment variable. It cannot be changed through the System Console.')).toBeInTheDocument();
        expect(screen.getByTestId('EnableLiveCaptionstrue')).toBeDisabled();
        expect(screen.getByTestId('EnableLiveCaptionsfalse')).toBeDisabled();
    });

    it('should not render when recordings are disabled', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    EnableRecordings: false,
                    EnableTranscriptions: true,
                    EnableLiveCaptions: true,
                },
                callsConfigEnvOverrides: {},
            },
        });

        expect(screen.queryByText('Enable live captions (Beta)')).not.toBeInTheDocument();
    });

    it('should not render when transcriptions are disabled', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    EnableRecordings: true,
                    EnableTranscriptions: false,
                    EnableLiveCaptions: true,
                },
                callsConfigEnvOverrides: {},
            },
        });

        expect(screen.queryByText('Enable live captions (Beta)')).not.toBeInTheDocument();
    });

    it('should not render on cloud', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    EnableRecordings: true,
                    EnableTranscriptions: true,
                    EnableLiveCaptions: true,
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

        expect(screen.queryByText('Enable live captions (Beta)')).not.toBeInTheDocument();
    });

    it('should not render when not enterprise', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    EnableRecordings: true,
                    EnableTranscriptions: true,
                    EnableLiveCaptions: true,
                },
                callsConfigEnvOverrides: {},
            },
            entities: {
                general: {
                    license: {},
                },
            },
        });

        expect(screen.queryByText('Enable live captions (Beta)')).not.toBeInTheDocument();
    });
});
