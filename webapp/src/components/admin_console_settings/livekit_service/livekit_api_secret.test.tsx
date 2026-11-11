// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {render, screen} from '@testing-library/react';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {mockStore} from 'src/testUtils';

import LiveKitAPISecret from './livekit_api_secret';

describe('LiveKitAPISecret', () => {
    const baseProps = {
        id: 'LiveKitAPISecret',
        label: 'LiveKit API secret',
        helpText: null,
        value: '',
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

    const renderComponent = (props = {}, envOverrides = {}) => {
        const store = mockStore({
            'plugins-com.mattermost.calls': {
                callsConfigEnvOverrides: envOverrides,
            },
        });

        return render(
            <Provider store={store}>
                <IntlProvider locale='en'>
                    <LiveKitAPISecret
                        {...baseProps}
                        {...props}
                    />
                </IntlProvider>
            </Provider>,
        );
    };

    it('should not show an error when empty', () => {
        renderComponent();
        expect(screen.queryByTestId('LiveKitAPISecreterror')).not.toBeInTheDocument();
    });

    it('should show an error when shorter than 32 characters', () => {
        renderComponent({value: 'a'.repeat(31)});
        expect(screen.getByTestId('LiveKitAPISecreterror')).toHaveTextContent('The API secret must be at least 32 characters.');
    });

    it('should not show an error at 32 characters', () => {
        renderComponent({value: 'a'.repeat(32)});
        expect(screen.queryByTestId('LiveKitAPISecreterror')).not.toBeInTheDocument();
    });

    it('should not show an error for the masked saved secret', () => {
        renderComponent({value: '********************************'});
        expect(screen.queryByTestId('LiveKitAPISecreterror')).not.toBeInTheDocument();
    });

    it('should not show an error when set by environment variable', () => {
        renderComponent({value: 'short'}, {LiveKitAPISecret: '********************************'});
        expect(screen.getByTestId('LiveKitAPISecretinput')).toBeDisabled();
        expect(screen.queryByTestId('LiveKitAPISecreterror')).not.toBeInTheDocument();
    });
});
