// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {render, screen} from '@testing-library/react';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {untranslatable} from 'src/utils';

import ICEAndTURNSection from './ice_and_turn';

describe('ICEAndTURNSection', () => {
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
                <ICEAndTURNSection settingsList={settingsList}/>
            </IntlProvider>,
        );
    };

    it('should render correctly with settings list', () => {
        renderComponent();

        expect(screen.getByText('ICE and TURN')).toBeInTheDocument();
        expect(screen.getByTestId('setting1')).toBeInTheDocument();
        expect(screen.getByTestId('setting2')).toBeInTheDocument();
    });
});
