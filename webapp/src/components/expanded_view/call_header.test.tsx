// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {CallAlertType} from 'src/types/types';

import CallHeader, {HeaderWarning} from './call_header';

jest.mock('src/components/call_status_timer', () => ({
    CallStatusTimer: () => <span data-testid='call-status-timer'/>,
}));

jest.mock('src/components/incoming_calls/expanded_incoming_call_container', () => ({
    ExpandedIncomingCallContainer: () => <div data-testid='incoming-calls'/>,
}));

type Props = React.ComponentProps<typeof CallHeader>;

describe('CallHeader', () => {
    const renderHeader = (props: Partial<Props> = {}) => render(
        <IntlProvider locale='en'>
            <CallHeader
                title='Call · alice'
                clientConnecting={false}
                participantCount={2}
                recordingBadge={null}
                isSharing={false}
                onStopSharing={jest.fn()}
                onCollapse={jest.fn()}
                warnings={[]}
                {...props}
            />
        </IntlProvider>,
    );

    test('shows the title, time and participant count', () => {
        renderHeader();

        expect(screen.getByRole('heading', {name: 'Call · alice'})).toBeInTheDocument();
        expect(screen.getByTestId('call-status-timer').parentElement).toHaveTextContent('•2 participants');
    });

    test('puts incoming calls in the middle of the header', () => {
        renderHeader();

        expect(screen.getByTestId('incoming-calls').parentElement).toHaveClass('CallHeader__center');
    });

    test('collapses the window', async () => {
        const onCollapse = jest.fn();
        renderHeader({onCollapse});

        await userEvent.click(screen.getByRole('button', {name: 'Collapse call window'}));

        expect(onCollapse).toHaveBeenCalled();
    });

    test('shows the sharing pill with Stop only while we share', async () => {
        const onStopSharing = jest.fn();
        renderHeader({onStopSharing});
        expect(screen.queryByTestId('calls-expanded-view-share-pill')).not.toBeInTheDocument();

        renderHeader({isSharing: true, onStopSharing});
        expect(screen.getByTestId('calls-expanded-view-share-pill')).toHaveTextContent('You are sharing your screen');

        await userEvent.click(screen.getByRole('button', {name: 'Stop'}));
        expect(onStopSharing).toHaveBeenCalled();
    });

    test('names a dismissable warning with its tone and dismisses it when pressed', async () => {
        const onDismiss = jest.fn();
        const warning: HeaderWarning = {id: 'ownConnection', tone: CallAlertType.Warning, icon: 'alert-outline', message: 'Your connection is poor. Video may pause.', onDismiss};
        renderHeader({warnings: [warning]});

        const button = screen.getByRole('button', {name: 'Dismiss notification: Warning: Your connection is poor. Video may pause.'});
        await userEvent.click(button);

        expect(onDismiss).toHaveBeenCalled();
        expect(screen.getByRole('status')).toContainElement(button);
    });

    test('shows a warning that cannot be dismissed as plain text', () => {
        const warning: HeaderWarning = {id: 'cameraFailed', tone: CallAlertType.Error, icon: 'video-outline', message: 'Unable to turn on your camera.'};
        renderHeader({warnings: [warning]});

        expect(screen.queryByRole('button', {name: /Dismiss notification/})).not.toBeInTheDocument();
        expect(screen.getByTestId('calls-header-warning-cameraFailed')).toHaveTextContent('Error: Unable to turn on your camera.');
    });
});
