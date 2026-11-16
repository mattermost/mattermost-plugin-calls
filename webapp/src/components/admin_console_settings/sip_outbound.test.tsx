// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {render, screen} from '@testing-library/react';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {mockStore} from 'src/testUtils';
import {untranslatable} from 'src/utils';

import {SIPOutboundSection} from './sip_outbound';

describe('SIPOutboundSection', () => {
    const settingsList = [
        <div
            key='setting1'
            data-testid='setting1'
        >{untranslatable('Setting 1')}</div>,
    ];

    const renderComponent = (license: Record<string, string>, sipOutboundAllowed = false) => {
        const store = mockStore({
            'plugins-com.mattermost.calls': {
                callsConfig: {SIPOutboundAllowed: sipOutboundAllowed},
            },
            entities: {
                general: {license},
            },
        });

        return render(
            <Provider store={store}>
                <IntlProvider locale='en'>
                    <SIPOutboundSection settingsList={settingsList}/>
                </IntlProvider>
            </Provider>,
        );
    };

    test('renders settings for Enterprise Advanced', () => {
        renderComponent({SkuShortName: 'advanced'}, true);

        expect(screen.getByText('Outbound phone calls')).toBeInTheDocument();
        expect(screen.getByTestId('setting1')).toBeInTheDocument();
        expect(screen.queryByTestId('calls-sip-outbound-promo')).not.toBeInTheDocument();
    });

    test.each([
        ['enterprise', {SkuShortName: 'enterprise'}],
        ['no license', {}],
    ])('renders the promo instead of settings for %s', (_name, license) => {
        renderComponent(license);

        expect(screen.getByText('Get access to outbound phone calls')).toBeInTheDocument();
        expect(screen.getByTestId('calls-sip-outbound-promo')).toBeInTheDocument();
        expect(screen.queryByTestId('setting1')).not.toBeInTheDocument();
    });

    test('renders settings when the server allows SIP outbound without an Advanced license (developer mode)', () => {
        renderComponent({SkuShortName: 'enterprise'}, true);

        expect(screen.getByTestId('setting1')).toBeInTheDocument();
        expect(screen.queryByTestId('calls-sip-outbound-promo')).not.toBeInTheDocument();
    });

    test('renders settings on cloud', () => {
        renderComponent({Cloud: 'true', SkuShortName: 'enterprise'});

        expect(screen.getByTestId('setting1')).toBeInTheDocument();
        expect(screen.queryByTestId('calls-sip-outbound-promo')).not.toBeInTheDocument();
    });
});
