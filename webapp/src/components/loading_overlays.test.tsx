// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Channel} from '@mattermost/types/channels';
import {render, screen} from '@testing-library/react';
import React from 'react';
import {createIntl, RawIntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {channelForCurrentCall} from 'src/selectors';
import {mockStore} from 'src/testUtils';

import {JoinLoadingOverlay} from './loading_overlays';

jest.mock('src/selectors', () => ({
    channelForCurrentCall: jest.fn(),
}));

const intl = createIntl({locale: 'en', messages: {}});

const mock = (fn: unknown) => fn as jest.Mock;

const dmChannel = {id: 'channel-id', name: 'user-id__other-user-id', type: 'D'} as Channel;
const openChannel = {id: 'channel-id', name: 'town-square', type: 'O'} as Channel;

type Opts = {
    channel?: Channel | null;
    visible?: boolean;
    joining?: boolean;
}

const renderOverlay = ({channel = openChannel, visible = true, joining = false}: Opts = {}) => {
    mock(channelForCurrentCall).mockReturnValue(channel ?? undefined);

    render(
        <Provider store={mockStore({})}>
            <RawIntlProvider value={intl}>
                <JoinLoadingOverlay
                    visible={visible}
                    joining={joining}
                />
            </RawIntlProvider>
        </Provider>,
    );
};

describe('JoinLoadingOverlay', () => {
    // A DM call reports its own progress in the widget header ("Starting call…" next to the callee),
    // so covering the widget with a second spinner would say the same thing twice.
    test('should not cover a DM call, which reports connecting in its header instead', () => {
        renderOverlay({channel: dmChannel});

        expect(screen.queryByTestId('calls-widget-loading-overlay')).not.toBeInTheDocument();
    });

    test('should not cover a DM call that is being joined either', () => {
        renderOverlay({channel: dmChannel, joining: true});

        expect(screen.queryByTestId('calls-widget-loading-overlay')).not.toBeInTheDocument();
    });

    test('should cover a channel call that is being started', () => {
        renderOverlay();

        expect(screen.getByTestId('calls-widget-loading-overlay')).toHaveTextContent('Starting call…');
    });

    test('should cover a channel call that is being joined', () => {
        renderOverlay({joining: true});

        expect(screen.getByTestId('calls-widget-loading-overlay')).toHaveTextContent('Joining call…');
    });

    test('should cover a channel call whose channel is not in the store yet', () => {
        renderOverlay({channel: null});

        expect(screen.getByTestId('calls-widget-loading-overlay')).toBeInTheDocument();
    });
});
