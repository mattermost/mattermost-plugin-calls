// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {ClientError} from '@mattermost/client';
import {render, screen} from '@testing-library/react';
import {ConnectionError} from 'livekit-client';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {
    insecureContextErr,
    JOIN_DENIED_MSGS,
    userRemovedFromChannelErr,
} from 'src/components/error_modal/error_messages';

import {ErrorModal} from './index';

const renderModal = (err: Error) => render(
    <IntlProvider locale='en'>
        <ErrorModal
            err={err}
            show={true}
        />
    </IntlProvider>,
);

const joinError = (message: string, status: number) => new ClientError('http://localhost', {
    message,
    status_code: status,
    url: '/plugins/com.mattermost.calls/livekit-token',
});

describe('ErrorModal', () => {
    describe('LiveKit connect failures', () => {
        it.each([
            ['internal', ConnectionError.internal('could not establish pc connection')],
            ['server unreachable', ConnectionError.serverUnreachable('could not establish signal connection')],
            ['timeout', ConnectionError.timeout('room connection has timed out (signal)')],
            ['not allowed', ConnectionError.notAllowed('invalid token', 401)],
        ])('shows "Call connection failed" for %s', (_name, err) => {
            renderModal(err);

            expect(screen.getByText('Call connection failed')).toBeInTheDocument();
            expect(screen.queryByText('Something went wrong with calls')).not.toBeInTheDocument();
        });
    });

    describe('LiveKit connect failure guidance', () => {
        it.each([
            ['server unreachable', ConnectionError.serverUnreachable('x')],
            ['timeout', ConnectionError.timeout('x')],
        ])('suggests checking the network for %s', (_name, err) => {
            renderModal(err);

            expect(screen.getByText(/check your network connection/)).toBeInTheDocument();
        });

        it.each([
            ['internal', ConnectionError.internal('x')],
            ['not allowed', ConnectionError.notAllowed('invalid token', 401)],
        ])('gives neutral retry guidance for %s', (_name, err) => {
            renderModal(err);

            expect(screen.queryByText(/check your network connection/)).not.toBeInTheDocument();
            expect(screen.getByText(/couldn't connect to the call. Please try again./)).toBeInTheDocument();
        });
    });

    describe('join API denials', () => {
        it.each([
            [JOIN_DENIED_MSGS.forbidden, 403, 'You don\'t have permission to start or join calls in this channel.'],
            [JOIN_DENIED_MSGS.insufficientPermissions, 403, 'You don\'t have permission to start or join calls in this channel.'],
            [JOIN_DENIED_MSGS.channelDisabled, 403, 'Calls are disabled in this channel.'],
            [JOIN_DENIED_MSGS.atCapacity, 403, 'This call has reached its maximum number of participants.'],
            [JOIN_DENIED_MSGS.groupCallsUnlicensed, 403, 'Calls in group channels require a licensed server. Calls are only available in direct messages.'],
            [JOIN_DENIED_MSGS.callEnded, 403, 'This call has already ended.'],
            [JOIN_DENIED_MSGS.channelArchived, 400, 'Calls can\'t be joined in an archived channel.'],
        ])('maps "%s" (%i) to localized copy', (serverMsg, status, expected) => {
            renderModal(joinError(serverMsg, status));

            expect(screen.getByText('Unable to join call')).toBeInTheDocument();
            expect(screen.getByText(expected)).toBeInTheDocument();
        });

        it('falls back to the generic modal for unmapped server text', () => {
            renderModal(joinError('some new server error', 403));

            expect(screen.getByText('Something went wrong with calls')).toBeInTheDocument();
            expect(screen.queryByText('some new server error')).not.toBeInTheDocument();
        });

        it('does not map server text on non-4xx statuses', () => {
            renderModal(joinError(JOIN_DENIED_MSGS.callEnded, 500));

            expect(screen.getByText('Something went wrong with calls')).toBeInTheDocument();
        });

        it('does not map matching text on a plain Error', () => {
            renderModal(new Error(JOIN_DENIED_MSGS.callEnded));

            expect(screen.getByText('Something went wrong with calls')).toBeInTheDocument();
        });
    });

    describe('existing cases', () => {
        it('shows the removed-from-channel modal', () => {
            renderModal(userRemovedFromChannelErr);

            expect(screen.getByText('You were removed from the channel')).toBeInTheDocument();
        });

        it('shows the insecure context modal', () => {
            renderModal(insecureContextErr);

            expect(screen.getByText('Calls can\'t be initiated in an insecure context')).toBeInTheDocument();
        });

        it('falls back to the generic modal for unknown errors', () => {
            renderModal(new Error('something else'));

            expect(screen.getByText('Something went wrong with calls')).toBeInTheDocument();
        });
    });
});
