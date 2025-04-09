// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {render, screen} from '@testing-library/react';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {mockStore} from 'src/testUtils';
import {untranslatable} from 'src/utils';

import CallRecordingsSection from './call_recordings';

describe('CallRecordingsSection', () => {
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
                callsConfig: {},
            },
            entities: {
                general: {
                    license: {
                        SkuShortName: 'enterprise',
                    },
                },
                admin: {
                    analytics: {},
                },
            },
            ...storeOverrides,
        });

        return render(
            <Provider store={store}>
                <IntlProvider locale='en'>
                    <CallRecordingsSection settingsList={settingsList}/>
                </IntlProvider>
            </Provider>,
        );
    };

    it('should render correctly with settings list for enterprise', () => {
        renderComponent();

        expect(screen.getByText('Call recordings')).toBeInTheDocument();
        expect(screen.getByText('Recordings include the entire call window view along with participants’ audio track and any shared screen video. Recordings are stored in Mattermost')).toBeInTheDocument();
        expect(screen.getByTestId('setting1')).toBeInTheDocument();
        expect(screen.getByTestId('setting2')).toBeInTheDocument();
    });

    it('should render with trial button for non-enterprise', () => {
        renderComponent({
            entities: {
                general: {
                    license: {},
                },
                admin: {
                    analytics: {},
                },
            },
        });

        expect(screen.getByText('Get access to call recordings, transcriptions, and live captions')).toBeInTheDocument();
        expect(screen.getAllByText('Try free for 30 days')[0]).toBeInTheDocument();
        expect(screen.queryByTestId('setting1')).not.toBeInTheDocument();
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
                admin: {
                    analytics: {},
                },
            },
        });

        expect(screen.queryByText('Call recordings')).not.toBeInTheDocument();
    });
});
