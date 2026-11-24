// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {ringingEnabled, sortedIncomingCalls} from 'src/selectors';
import {mockStore} from 'src/testUtils';
import {ChannelType, IncomingCallNotification} from 'src/types/types';

import {ExpandedIncomingCallContainer} from './expanded_incoming_call_container';
import {useDismissJoin, useGetCallerNameAndOthers, useOnChannelLinkClick} from './hooks';

jest.mock('./hooks', () => ({
    useDismissJoin: jest.fn(),
    useGetCallerNameAndOthers: jest.fn(),
    useOnChannelLinkClick: jest.fn(),
    useRingingAndNotification: jest.fn(),
}));

jest.mock('src/selectors', () => ({
    ringingEnabled: jest.fn(),
    sortedIncomingCalls: jest.fn(),
}));

jest.mock('src/clients/rest', () => ({
    __esModule: true,
    default: {getProfilePictureUrl: (id: string) => `/api/v4/users/${id}/image`},
}));

const call = (overrides: Partial<IncomingCallNotification> = {}): IncomingCallNotification => ({
    callID: 'call-1',
    channelID: 'dm-channel',
    callerID: 'caller',
    startAt: 1,
    type: ChannelType.DM,
    ...overrides,
});

describe('ExpandedIncomingCallContainer', () => {
    const onDismiss = jest.fn((ev: React.MouseEvent) => ev.stopPropagation());
    const onJoin = jest.fn((ev: React.MouseEvent) => ev.stopPropagation());
    const openConversation = jest.fn();

    const renderNotices = (calls: IncomingCallNotification[], enabled = true) => {
        (ringingEnabled as unknown as jest.Mock).mockReturnValue(enabled);
        (sortedIncomingCalls as unknown as jest.Mock).mockReturnValue(calls);
        render(
            <Provider store={mockStore({entities: {users: {profiles: {caller: {id: 'caller', username: 'alice', last_picture_update: 0}}}}})}>
                <IntlProvider locale='en'>
                    <ExpandedIncomingCallContainer/>
                </IntlProvider>
            </Provider>,
        );
    };

    beforeEach(() => {
        (useDismissJoin as jest.Mock).mockReturnValue([onDismiss, onJoin]);
        (useGetCallerNameAndOthers as jest.Mock).mockReturnValue(['alice', 'bob and carol']);
        (useOnChannelLinkClick as jest.Mock).mockReturnValue(openConversation);
    });

    test('renders nothing without incoming calls or with ringing off', () => {
        renderNotices([]);
        expect(screen.queryByRole('region')).not.toBeInTheDocument();

        renderNotices([call()], false);
        expect(screen.queryByRole('region')).not.toBeInTheDocument();
    });

    test('is a labelled region with a labelled notice per call', () => {
        renderNotices([call()]);

        expect(screen.getByRole('region', {name: 'Incoming calls'})).toBeInTheDocument();
        expect(screen.getByRole('group', {name: 'Call from alice'})).toHaveTextContent('Call from alice');
    });

    test('names the others in a group message call', () => {
        renderNotices([call({type: ChannelType.GM})]);

        expect(screen.getByRole('group', {name: 'Call from alice with bob and carol'})).toBeInTheDocument();
    });

    test('joins from the Join button without opening the conversation', async () => {
        renderNotices([call()]);

        await userEvent.click(screen.getByRole('button', {name: 'Join'}));

        expect(onJoin).toHaveBeenCalledTimes(1);
        expect(openConversation).not.toHaveBeenCalled();
    });

    test('dismisses from the dismiss button', async () => {
        renderNotices([call()]);

        await userEvent.click(screen.getByRole('button', {name: 'Dismiss call from alice'}));

        expect(onDismiss).toHaveBeenCalledTimes(1);
        expect(openConversation).not.toHaveBeenCalled();
    });

    test('opens the conversation from the notice, also by keyboard', async () => {
        const user = userEvent.setup();
        renderNotices([call()]);

        await user.click(screen.getByRole('group', {name: 'Call from alice'}));
        expect(openConversation).toHaveBeenCalledTimes(1);

        screen.getByRole('button', {name: 'Open conversation: Call from alice'}).focus();
        await user.keyboard('{Enter}');
        expect(openConversation).toHaveBeenCalledTimes(2);
    });
});
