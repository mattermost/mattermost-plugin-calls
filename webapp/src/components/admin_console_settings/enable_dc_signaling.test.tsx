// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {mockStore} from 'src/testUtils';

import EnableDCSignaling from './enable_dc_signaling';

describe('EnableDCSignaling', () => {
    const baseProps = {
        id: 'EnableDCSignaling',
        label: 'Use data channels for signaling (Experimental)',
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
                    EnableDCSignaling: true,
                },
                callsConfigEnvOverrides: {},
            },
            ...storeOverrides,
        });

        return render(
            <Provider store={store}>
                <IntlProvider locale='en'>
                    <EnableDCSignaling
                        {...baseProps}
                        {...props}
                    />
                </IntlProvider>
            </Provider>,
        );
    };

    it('should render correctly with default value', () => {
        renderComponent();

        expect(screen.getByText('Use data channels for signaling (Experimental)')).toBeInTheDocument();
        expect(screen.getByText('True')).toBeInTheDocument();
        expect(screen.getByText('False')).toBeInTheDocument();
        expect(screen.getByText('When set to true, clients will use WebRTC data channels for signaling of new media tracks. This can result in a more efficient and less race-prone process, especially in case of frequent WebSocket disconnections.')).toBeInTheDocument();

        // True should be checked
        expect(screen.getByTestId('EnableDCSignalingtrue')).toBeChecked();
        expect(screen.getByTestId('EnableDCSignalingfalse')).not.toBeChecked();
    });

    it('should render correctly with false value', () => {
        renderComponent({value: 'false'});

        // False should be checked
        expect(screen.getByTestId('EnableDCSignalingtrue')).not.toBeChecked();
        expect(screen.getByTestId('EnableDCSignalingfalse')).toBeChecked();
    });

    it('should handle boolean false value correctly', () => {
        renderComponent({value: false});

        // False should be checked
        expect(screen.getByTestId('EnableDCSignalingtrue')).not.toBeChecked();
        expect(screen.getByTestId('EnableDCSignalingfalse')).toBeChecked();
    });

    it('should handle overridden false value correctly', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    EnableDCSignaling: false,
                },
                callsConfigEnvOverrides: {
                    EnableDCSignaling: 'false',
                },
            },
        });

        // False should be checked when overridden
        expect(screen.getByTestId('EnableDCSignalingtrue')).not.toBeChecked();
        expect(screen.getByTestId('EnableDCSignalingfalse')).toBeChecked();
        expect(screen.getByTestId('EnableDCSignalingtrue')).toBeDisabled();
        expect(screen.getByTestId('EnableDCSignalingfalse')).toBeDisabled();
    });

    it('should handle undefined value correctly', () => {
        // eslint-disable-next-line no-undefined
        renderComponent({value: undefined});

        // Should default to false when undefined
        expect(screen.getByTestId('EnableDCSignalingtrue')).not.toBeChecked();
        expect(screen.getByTestId('EnableDCSignalingfalse')).toBeChecked();
    });

    it('should call onChange when radio button is clicked', async () => {
        const onChange = jest.fn();
        renderComponent({value: 'true', onChange});

        await userEvent.click(screen.getByTestId('EnableDCSignalingfalse'));
        expect(onChange).toHaveBeenCalledWith('EnableDCSignaling', false);
    });

    it('should be disabled when disabled prop is true', () => {
        renderComponent({disabled: true});

        expect(screen.getByTestId('EnableDCSignalingtrue')).toBeDisabled();
        expect(screen.getByTestId('EnableDCSignalingfalse')).toBeDisabled();
    });

    it('should show environment override warning when setting is overridden', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    EnableDCSignaling: true,
                },
                callsConfigEnvOverrides: {
                    EnableDCSignaling: 'true',
                },
            },
        });

        expect(screen.getByText('This setting has been set through an environment variable. It cannot be changed through the System Console.')).toBeInTheDocument();
        expect(screen.getByTestId('EnableDCSignalingtrue')).toBeDisabled();
        expect(screen.getByTestId('EnableDCSignalingfalse')).toBeDisabled();
    });
});
