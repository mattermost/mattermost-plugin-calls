// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {fireEvent, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {mockStore} from 'src/testUtils';

import MaxCallParticipants from './max_call_participants';

describe('MaxCallParticipants', () => {
    const baseProps = {
        id: 'MaxCallParticipants',
        label: 'Max call participants',
        helpText: null,
        value: '10',
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
                    MaxCallParticipants: 10,
                },
                callsConfigEnvOverrides: {},
            },
            ...storeOverrides,
        });

        return render(
            <Provider store={store}>
                <IntlProvider locale='en'>
                    <MaxCallParticipants
                        {...baseProps}
                        {...props}
                    />
                </IntlProvider>
            </Provider>,
        );
    };

    it('should render correctly with default value', () => {
        renderComponent();

        expect(screen.getByText('Max call participants')).toBeInTheDocument();
        expect(screen.getByText('The maximum number of participants that can join a call. If left empty, or set to 0, an unlimited number of participants can join.')).toBeInTheDocument();

        const input = screen.getByTestId('MaxCallParticipantsnumber');
        expect(input).toHaveValue(10);
    });

    it('should call onChange when input value changes', async () => {
        const onChange = jest.fn();
        renderComponent({onChange});

        const input = screen.getByTestId('MaxCallParticipantsnumber');
        await userEvent.clear(input);

        // Use fireEvent.change instead of userEvent.paste
        fireEvent.change(input, {target: {value: '20'}});

        expect(onChange).toHaveBeenCalledWith('MaxCallParticipants', 20);
    });

    it('should be disabled when disabled prop is true', () => {
        renderComponent({disabled: true});

        const input = screen.getByTestId('MaxCallParticipantsnumber');
        expect(input).toBeDisabled();
    });

    it('should show environment override warning when setting is overridden', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    MaxCallParticipants: 10,
                },
                callsConfigEnvOverrides: {
                    MaxCallParticipants: '10',
                },
            },
        });

        expect(screen.getByText('This setting has been set through an environment variable. It cannot be changed through the System Console.')).toBeInTheDocument();
        expect(screen.getByTestId('MaxCallParticipantsnumber')).toBeDisabled();
    });
});
