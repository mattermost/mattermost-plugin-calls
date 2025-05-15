// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {fireEvent, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {mockStore} from 'src/testUtils';

import LiveCaptionsLanguage from './live_captions_language';

describe('LiveCaptionsLanguage', () => {
    const baseProps = {
        id: 'LiveCaptionsLanguage',
        label: 'Live captions language',
        helpText: null,
        value: 'en',
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
                    LiveCaptionsLanguage: 'en',
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
                    <LiveCaptionsLanguage
                        {...baseProps}
                        {...props}
                    />
                </IntlProvider>
            </Provider>,
        );
    };

    it('should render correctly with default value', () => {
        renderComponent();

        expect(screen.getByText('Live captions language')).toBeInTheDocument();
        expect(screen.getByText('The language passed to the live captions transcriber. Should be a 2-letter ISO 639 Set 1 language code, e.g. \'en\'. If blank, will be set to English \'en\' as default.')).toBeInTheDocument();

        const input = screen.getByTestId('LiveCaptionsLanguageinput');
        expect(input).toHaveValue('en');
    });

    it('should call onChange when input value changes', async () => {
        const onChange = jest.fn();
        renderComponent({onChange});

        const input = screen.getByTestId('LiveCaptionsLanguageinput');
        await userEvent.clear(input);
        fireEvent.change(input, {target: {value: 'fr'}});

        expect(onChange).toHaveBeenCalledWith('LiveCaptionsLanguage', 'fr');
    });

    it('should be disabled when disabled prop is true', () => {
        renderComponent({disabled: true});

        const input = screen.getByTestId('LiveCaptionsLanguageinput');
        expect(input).toBeDisabled();
    });

    it('should show environment override warning when setting is overridden', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    EnableRecordings: true,
                    EnableTranscriptions: true,
                    EnableLiveCaptions: true,
                    LiveCaptionsLanguage: 'en',
                },
                callsConfigEnvOverrides: {
                    LiveCaptionsLanguage: 'en',
                },
            },
        });

        expect(screen.getByText('This setting has been set through an environment variable. It cannot be changed through the System Console.')).toBeInTheDocument();
        expect(screen.getByTestId('LiveCaptionsLanguageinput')).toBeDisabled();
    });

    it('should not render when recordings are disabled', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    EnableRecordings: false,
                    EnableTranscriptions: true,
                    EnableLiveCaptions: true,
                    LiveCaptionsLanguage: 'en',
                },
                callsConfigEnvOverrides: {},
            },
        });

        expect(screen.queryByText('Live captions language')).not.toBeInTheDocument();
    });

    it('should not render when transcriptions are disabled', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    EnableRecordings: true,
                    EnableTranscriptions: false,
                    EnableLiveCaptions: true,
                    LiveCaptionsLanguage: 'en',
                },
                callsConfigEnvOverrides: {},
            },
        });

        expect(screen.queryByText('Live captions language')).not.toBeInTheDocument();
    });

    it('should not render when live captions are disabled', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    EnableRecordings: true,
                    EnableTranscriptions: true,
                    EnableLiveCaptions: false,
                    LiveCaptionsLanguage: 'en',
                },
                callsConfigEnvOverrides: {},
            },
        });

        expect(screen.queryByText('Live captions language')).not.toBeInTheDocument();
    });

    it('should not render on cloud', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    EnableRecordings: true,
                    EnableTranscriptions: true,
                    EnableLiveCaptions: true,
                    LiveCaptionsLanguage: 'en',
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

        expect(screen.queryByText('Live captions language')).not.toBeInTheDocument();
    });
});
