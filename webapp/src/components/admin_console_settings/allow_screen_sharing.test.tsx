// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {mockStore} from 'src/testUtils';

import AllowScreenSharing from './allow_screen_sharing';

describe('AllowScreenSharing', () => {
    const baseProps = {
        id: 'AllowScreenSharing',
        label: 'Allow screen sharing',
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
                    AllowScreenSharing: true,
                },
                callsConfigEnvOverrides: {},
            },
            ...storeOverrides,
        });

        return render(
            <Provider store={store}>
                <IntlProvider locale='en'>
                    <AllowScreenSharing
                        {...baseProps}
                        {...props}
                    />
                </IntlProvider>
            </Provider>,
        );
    };

    it('should render correctly with default value', () => {
        renderComponent();

        expect(screen.getByText('Allow screen sharing')).toBeInTheDocument();
        expect(screen.getByText('True')).toBeInTheDocument();
        expect(screen.getByText('False')).toBeInTheDocument();
        expect(screen.getByText('When set to true, call participants can share their screen.')).toBeInTheDocument();

        // True should be checked
        expect(screen.getByTestId('AllowScreenSharingtrue')).toBeChecked();
        expect(screen.getByTestId('AllowScreenSharingfalse')).not.toBeChecked();
    });

    it('should render correctly with false value', () => {
        renderComponent({value: 'false'});

        // False should be checked
        expect(screen.getByTestId('AllowScreenSharingtrue')).not.toBeChecked();
        expect(screen.getByTestId('AllowScreenSharingfalse')).toBeChecked();
    });

    it('should handle falsey values correctly', () => {
        renderComponent({value: false});

        // False should be checked
        expect(screen.getByTestId('AllowScreenSharingtrue')).not.toBeChecked();
        expect(screen.getByTestId('AllowScreenSharingfalse')).toBeChecked();
    });

    it('should handle overridden false value correctly', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    AllowScreenSharing: false,
                },
                callsConfigEnvOverrides: {
                    AllowScreenSharing: 'false',
                },
            },
        });

        // False should be checked when overridden
        expect(screen.getByTestId('AllowScreenSharingtrue')).not.toBeChecked();
        expect(screen.getByTestId('AllowScreenSharingfalse')).toBeChecked();
        expect(screen.getByTestId('AllowScreenSharingtrue')).toBeDisabled();
        expect(screen.getByTestId('AllowScreenSharingfalse')).toBeDisabled();
    });

    it('should handle undefined value correctly (default to true)', () => {
        // eslint-disable-next-line no-undefined
        renderComponent({value: undefined});

        // True should be checked (default)
        expect(screen.getByTestId('AllowScreenSharingtrue')).toBeChecked();
        expect(screen.getByTestId('AllowScreenSharingfalse')).not.toBeChecked();
    });

    it('should call onChange when radio button is clicked', async () => {
        const onChange = jest.fn();
        renderComponent({value: 'true', onChange});

        await userEvent.click(screen.getByTestId('AllowScreenSharingfalse'));
        expect(onChange).toHaveBeenCalledWith('AllowScreenSharing', false);
    });

    it('should be disabled when disabled prop is true', () => {
        renderComponent({disabled: true});

        expect(screen.getByTestId('AllowScreenSharingtrue')).toBeDisabled();
        expect(screen.getByTestId('AllowScreenSharingfalse')).toBeDisabled();
    });

    it('should show environment override warning when setting is overridden', () => {
        renderComponent({}, {
            'plugins-com.mattermost.calls': {
                callsConfig: {
                    AllowScreenSharing: true,
                },
                callsConfigEnvOverrides: {
                    AllowScreenSharing: 'true',
                },
            },
        });

        expect(screen.getByText('This setting has been set through an environment variable. It cannot be changed through the System Console.')).toBeInTheDocument();
        expect(screen.getByTestId('AllowScreenSharingtrue')).toBeDisabled();
        expect(screen.getByTestId('AllowScreenSharingfalse')).toBeDisabled();
    });
});
