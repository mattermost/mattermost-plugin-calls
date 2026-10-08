// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {mockStore} from 'src/testUtils';

import LiveKitSIPOutboundTrunkTransport from './livekit_sip_outbound_trunk_transport';

describe('LiveKitSIPOutboundTrunkTransport', () => {
    const baseProps = {
        id: 'LiveKitSIPOutboundTrunkTransport',
        label: 'SIP Outbound Trunk Transport',
        helpText: null,
        value: 'tcp',
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
                callsConfig: {},
                callsConfigEnvOverrides: envOverrides,
            },
        });

        return render(
            <Provider store={store}>
                <IntlProvider locale='en'>
                    <LiveKitSIPOutboundTrunkTransport
                        {...baseProps}
                        {...props}
                    />
                </IntlProvider>
            </Provider>,
        );
    };

    it('should select the configured transport and report changes', async () => {
        const onChange = jest.fn();
        renderComponent({onChange});

        const dropdown = screen.getByTestId('LiveKitSIPOutboundTrunkTransportdropdown');
        expect(dropdown).toHaveValue('tcp');
        expect(dropdown).toBeEnabled();

        await userEvent.selectOptions(dropdown, 'tls');
        expect(onChange).toHaveBeenCalledWith('LiveKitSIPOutboundTrunkTransport', 'tls');
    });

    it('should default to auto when unset', () => {
        renderComponent({value: ''});

        expect(screen.getByTestId('LiveKitSIPOutboundTrunkTransportdropdown')).toHaveValue('auto');
    });

    it('should be disabled with a warning when set by environment variable', () => {
        renderComponent({}, {LiveKitSIPOutboundTrunkTransport: 'udp'});

        expect(screen.getByTestId('LiveKitSIPOutboundTrunkTransportdropdown')).toBeDisabled();
        expect(screen.getByText('This setting has been set through an environment variable. It cannot be changed through the System Console.')).toBeInTheDocument();
    });
});
