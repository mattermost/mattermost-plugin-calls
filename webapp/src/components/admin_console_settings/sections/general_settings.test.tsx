// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {render, screen} from '@testing-library/react';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {untranslatable} from 'src/utils';

import GeneralSettingsSection from './general_settings';

describe('GeneralSettingsSection', () => {
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

    const renderComponent = () => {
        return render(
            <IntlProvider locale='en'>
                <GeneralSettingsSection settingsList={settingsList}/>
            </IntlProvider>,
        );
    };

    it('should render correctly with settings list', () => {
        renderComponent();

        expect(screen.getByText('General settings')).toBeInTheDocument();
        expect(screen.getByText('Settings for participants, screen sharing, ringing, and more')).toBeInTheDocument();
        expect(screen.getByTestId('setting1')).toBeInTheDocument();
        expect(screen.getByTestId('setting2')).toBeInTheDocument();
    });
});
