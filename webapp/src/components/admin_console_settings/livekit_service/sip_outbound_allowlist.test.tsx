// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, {useState} from 'react';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {applyMiddleware, combineReducers, createStore} from 'redux';
import {thunk} from 'redux-thunk';
import {RECEIVED_CALLS_CONFIG_ENV_OVERRIDES} from 'src/action_types';
import rootReducer from 'src/reducers';
import {mockStore} from 'src/testUtils';

import EnableSIPOutboundAllowlist from './enable_sip_outbound_allowlist';
import SIPOutboundAllowlist from './sip_outbound_allowlist';

describe('SIPOutboundAllowlist', () => {
    const baseProps = {
        id: 'SIPOutboundAllowlist',
        label: 'Outbound phone number allowlist',
        helpText: null,
        value: '+15551234567',
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

    const renderComponent = (props = {}, pluginState = {}) => {
        const store = mockStore({
            'plugins-com.mattermost.calls': {
                callsConfigEnvOverrides: {},
                sipOutboundAllowlistEnabled: true,
                ...pluginState,
            },
        });

        return render(
            <Provider store={store}>
                <IntlProvider locale='en'>
                    <SIPOutboundAllowlist
                        {...baseProps}
                        {...props}
                    />
                </IntlProvider>
            </Provider>,
        );
    };

    it('should be editable when the allowlist is enabled', async () => {
        const onChange = jest.fn();
        renderComponent({onChange});

        const input = screen.getByTestId('SIPOutboundAllowlistinput');
        expect(input).toHaveValue('+15551234567');
        expect(input).toBeEnabled();

        await userEvent.type(input, '1');
        expect(onChange).toHaveBeenCalledWith('SIPOutboundAllowlist', '+155512345671');
    });

    it('should be read-only but keep its value when the allowlist is disabled', () => {
        renderComponent({}, {sipOutboundAllowlistEnabled: false});

        const input = screen.getByTestId('SIPOutboundAllowlistinput');
        expect(input).toHaveValue('+15551234567');
        expect(input).toBeDisabled();
    });

    it('should be disabled with a warning when set by environment variable', () => {
        renderComponent({}, {callsConfigEnvOverrides: {SIPOutboundAllowlist: '+15551234567'}});

        expect(screen.getByTestId('SIPOutboundAllowlistinput')).toBeDisabled();
        expect(screen.getByText('This setting has been set through an environment variable. It cannot be changed through the System Console.')).toBeInTheDocument();
    });

    describe('with the enable toggle', () => {
        const Settings = ({initialEnabled}: {initialEnabled: boolean}) => {
            const [enabled, setEnabled] = useState(initialEnabled);
            return (
                <>
                    <EnableSIPOutboundAllowlist
                        {...baseProps}
                        id='EnableSIPOutboundAllowlist'
                        value={String(enabled)}
                        onChange={(_, value) => setEnabled(value as boolean)}
                    />
                    <SIPOutboundAllowlist {...baseProps}/>
                </>
            );
        };

        const renderSettings = (initialEnabled: boolean, envOverrides: Record<string, string> = {}) => {
            const store = createStore(
                combineReducers({
                    'plugins-com.mattermost.calls': rootReducer,
                    entities: (state = {}) => state,
                }),
                applyMiddleware(thunk),
            );
            store.dispatch({type: RECEIVED_CALLS_CONFIG_ENV_OVERRIDES, data: envOverrides});

            return render(
                <Provider store={store}>
                    <IntlProvider locale='en'>
                        <Settings initialEnabled={initialEnabled}/>
                    </IntlProvider>
                </Provider>,
            );
        };

        it('should follow the unsaved toggle value', async () => {
            renderSettings(false);

            const input = screen.getByTestId('SIPOutboundAllowlistinput');
            expect(input).toBeDisabled();

            await userEvent.click(screen.getByTestId('EnableSIPOutboundAllowlisttrue'));
            expect(input).toBeEnabled();
            expect(input).toHaveValue('+15551234567');

            await userEvent.click(screen.getByTestId('EnableSIPOutboundAllowlistfalse'));
            expect(input).toBeDisabled();
            expect(input).toHaveValue('+15551234567');
        });

        it('should follow the toggle value set by environment variable', () => {
            renderSettings(false, {EnableSIPOutboundAllowlist: 'true'});

            expect(screen.getByTestId('EnableSIPOutboundAllowlisttrue')).toBeChecked();
            expect(screen.getByTestId('SIPOutboundAllowlistinput')).toBeEnabled();
        });
    });
});
