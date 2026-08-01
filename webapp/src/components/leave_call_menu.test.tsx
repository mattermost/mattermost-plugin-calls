// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import React from 'react';
import {createIntl, RawIntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {mockStore} from 'src/testUtils';

import {LeaveCallMenu} from './leave_call_menu';

// The dot menu pulls in @floating-ui, whose UMD build doesn't load under jest.
jest.mock('src/components/dot_menu/dot_menu', () => ({
    DropdownMenuItem: ({children, onClick}: { children: React.ReactNode; onClick?: () => void }) => (

        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
        <div onClick={onClick}>{children}</div>
    ),
}));

jest.mock('src/actions', () => ({
    hostEndCallForEveryone: jest.fn(),
    displayGenericErrorModal: jest.fn(() => ({type: 'displayGenericErrorModal'})),
}));

// `modals` is undefined unless the webapp injected it, which is what the component branches on.
// A getter lets a test take it away again to stand in for the global widget.
let mockModals: unknown = {openModal: jest.fn()};
jest.mock('src/webapp_globals', () => ({
    get modals() {
        return mockModals;
    },
}));

jest.mock('src/log', () => ({
    logErr: jest.fn(),
}));

/* eslint-disable import/order */
import {displayGenericErrorModal, hostEndCallForEveryone} from 'src/actions';
import {logErr} from 'src/log';
/* eslint-enable import/order */

const intl = createIntl({locale: 'en', messages: {}});

const channelID = 'channel-id';

// isCurrentUserSystemAdmin reads the roles off the current user's profile, so the slice has to be
// modelled rather than left as the default empty stub.
const stubState = (iAmAdmin: boolean) => ({
    entities: {
        users: {
            currentUserId: 'my-user-id',
            profiles: {
                'my-user-id': {
                    id: 'my-user-id',
                    roles: iAmAdmin ? 'system_user system_admin' : 'system_user',
                },
            },
        },
    },
});

type Opts = {
    isHost?: boolean;
    numParticipants?: number;
    iAmAdmin?: boolean;
};

const renderMenu = ({isHost = false, numParticipants = 2, iAmAdmin = false}: Opts = {}) => {
    const leaveCall = jest.fn();

    const rendered = render(
        <Provider store={mockStore(stubState(iAmAdmin))}>
            <RawIntlProvider value={intl}>
                <LeaveCallMenu
                    channelID={channelID}
                    isHost={isHost}
                    numParticipants={numParticipants}
                    leaveCall={leaveCall}
                />
            </RawIntlProvider>
        </Provider>,
    );

    return {...rendered, leaveCall};
};

const endCallItem = () => screen.queryByText('End call for everyone');

describe('LeaveCallMenu', () => {
    beforeEach(() => {
        mockModals = {openModal: jest.fn()};
    });

    test('should offer to end the call for everyone to the host', () => {
        renderMenu({isHost: true});

        expect(endCallItem()).toBeInTheDocument();
        expect(screen.getByText('All participants will be disconnected')).toBeInTheDocument();
    });

    test('should offer to end the call for everyone to a system admin', () => {
        renderMenu({isHost: false, iAmAdmin: true});

        expect(endCallItem()).toBeInTheDocument();
    });

    test('should not offer to end the call for everyone to a regular participant', () => {
        renderMenu({isHost: false, iAmAdmin: false});

        expect(endCallItem()).not.toBeInTheDocument();
    });

    test('should not offer to end the call for everyone when the host is alone in the call', () => {
        renderMenu({isHost: true, numParticipants: 1});

        expect(endCallItem()).not.toBeInTheDocument();
    });

    test('should always offer to leave the call and to cancel', () => {
        renderMenu({isHost: false});

        expect(screen.getByText('Leave call')).toBeInTheDocument();
        expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    test('should leave the call when the leave item is clicked', () => {
        const {leaveCall} = renderMenu();

        fireEvent.click(screen.getByText('Leave call'));

        expect(leaveCall).toHaveBeenCalled();
    });

    test('should end the call for everyone when the end call item is clicked', async () => {
        (hostEndCallForEveryone as jest.Mock).mockResolvedValue({});
        renderMenu({isHost: true});

        fireEvent.click(endCallItem() as HTMLElement);

        await waitFor(() => expect(hostEndCallForEveryone).toHaveBeenCalledWith(channelID));
        expect(displayGenericErrorModal).not.toHaveBeenCalled();
    });

    test('should show an error modal when ending the call for everyone fails', async () => {
        const err = new Error('failed');
        (hostEndCallForEveryone as jest.Mock).mockRejectedValue(err);
        renderMenu({isHost: true});

        fireEvent.click(endCallItem() as HTMLElement);

        await waitFor(() => expect(displayGenericErrorModal).toHaveBeenCalled());
        expect(logErr).toHaveBeenCalledWith('failed to end call for everyone', err);
    });

    test('should not show an error modal in the global widget, which has no modals', async () => {
        // The global widget runs outside the webapp, so `modals` is never injected.
        mockModals = undefined;

        (hostEndCallForEveryone as jest.Mock).mockRejectedValue(new Error('failed'));
        renderMenu({isHost: true});

        fireEvent.click(endCallItem() as HTMLElement);

        await waitFor(() => expect(logErr).toHaveBeenCalled());
        expect(displayGenericErrorModal).not.toHaveBeenCalled();
    });
});
