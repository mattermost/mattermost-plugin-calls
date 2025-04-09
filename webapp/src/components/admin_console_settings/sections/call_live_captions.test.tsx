// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {render, screen} from '@testing-library/react';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {mockStore} from 'src/testUtils';
import {untranslatable} from 'src/utils';

import CallLiveCaptionsSection from './call_live_captions';

describe('CallLiveCaptionsSection', () => {
    const settingsList = [
        <div
            key='setting1'
            data-testid='setting1'
        >{untranslatable('Setting 1')}</div>,
        <div
            key='setting2'
            data-testid='setting2'
        >{untranslatable('Setting 2')}</div>,
    ];

    const renderComponent = (storeOverrides = {}) => {
        const store = mockStore({
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    EnableRecordings: true,
                    EnableTranscriptions: true,
                },
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
                    <CallLiveCaptionsSection settingsList={settingsList}/>
                </IntlProvider>
            </Provider>,
        );
    };

    it('should render correctly with settings list when recordings and transcriptions are enabled', () => {
        renderComponent();

        expect(screen.getByText('Live captions')).toBeInTheDocument();
        expect(screen.getByText('Displays spoken words as text captions during a call. Recordings and transcriptions must be enabled')).toBeInTheDocument();
        expect(screen.getByTestId('setting1')).toBeInTheDocument();
        expect(screen.getByTestId('setting2')).toBeInTheDocument();
    });

    it('should render with disabled message when recordings are disabled', () => {
        renderComponent({
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    EnableRecordings: false,
                    EnableTranscriptions: true,
                },
            },
        });

        expect(screen.getByText('Live captions')).toBeInTheDocument();
        expect(screen.getByText('Displays spoken words as text captions during a call. To enable live captions, recordings and transcriptions must be enabled first')).toBeInTheDocument();
        expect(screen.queryByTestId('setting1')).not.toBeInTheDocument();
        expect(screen.queryByTestId('setting2')).not.toBeInTheDocument();
    });

    it('should render with disabled message when transcriptions are disabled', () => {
        renderComponent({
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    EnableRecordings: true,
                    EnableTranscriptions: false,
                },
            },
        });

        expect(screen.getByText('Live captions')).toBeInTheDocument();
        expect(screen.getByText('Displays spoken words as text captions during a call. To enable live captions, recordings and transcriptions must be enabled first')).toBeInTheDocument();
        expect(screen.queryByTestId('setting1')).not.toBeInTheDocument();
        expect(screen.queryByTestId('setting2')).not.toBeInTheDocument();
    });

    it('should not render on cloud', () => {
        renderComponent({
            entities: {
                general: {
                    license: {
                        Cloud: 'true',
                        SkuShortName: 'enterprise',
                    },
                },
            },
        });

        expect(screen.queryByText('Live captions')).not.toBeInTheDocument();
    });

    it('should not render when not enterprise', () => {
        renderComponent({
            entities: {
                general: {
                    license: {},
                },
            },
        });

        expect(screen.queryByText('Live captions')).not.toBeInTheDocument();
    });
});
