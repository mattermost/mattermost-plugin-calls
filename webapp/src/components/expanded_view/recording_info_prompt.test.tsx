// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {fireEvent, render, screen} from '@testing-library/react';
import React from 'react';
import {createIntl, RawIntlProvider} from 'react-intl';
import {CallJobReduxState} from 'src/types/types';

import RecordingInfoPrompt from './recording_info_prompt';

const intl = createIntl({locale: 'en', messages: {}});

const minute = 60 * 1000;
const maxDuration = 60;

describe('RecordingInfoPrompt', () => {
    const renderPrompt = (recording: CallJobReduxState, promptDismissed = jest.fn()) => {
        const props = {
            isHost: true,
            hostChangeAt: 0,
            recording,
            recordingMaxDuration: maxDuration,
            onDecline: jest.fn(),
            promptDismissed,
            transcriptionsEnabled: false,
        };
        const result = render(
            <RawIntlProvider value={intl}>
                <RecordingInfoPrompt {...props}/>
            </RawIntlProvider>,
        );
        const rerender = (rec: CallJobReduxState) => result.rerender(
            <RawIntlProvider value={intl}>
                <RecordingInfoPrompt
                    {...props}
                    recording={rec}
                />
            </RawIntlProvider>,
        );
        return {rerender};
    };

    it('dismissing the start banner passes no floor', () => {
        const promptDismissed = jest.fn();
        renderPrompt({init_at: 1, start_at: Date.now() - minute, end_at: 0}, promptDismissed);

        expect(screen.getByTestId('banner-recording')).toBeTruthy();
        fireEvent.click(screen.getByText('Dismiss'));
        expect(promptDismissed).toHaveBeenCalledWith();
    });

    it('does not warn before the threshold', () => {
        const startAt = Date.now() - (30 * minute);
        renderPrompt({init_at: 1, start_at: startAt, end_at: 0, prompt_dismissed_at: startAt + 1});

        expect(screen.queryByTestId('recording-will-end-soon')).toBeNull();
    });

    it('warns near the limit after the start banner was dismissed', () => {
        const startAt = Date.now() - (55 * minute);
        const promptDismissed = jest.fn();
        const {rerender} = renderPrompt({init_at: 1, start_at: startAt, end_at: 0, prompt_dismissed_at: startAt + 1}, promptDismissed);

        expect(screen.getByTestId('recording-will-end-soon')).toBeTruthy();

        // Dismissing records the server-time threshold instant, which hides the warning.
        fireEvent.click(screen.getByText('Dismiss'));
        const willEndSoonAt = startAt + ((maxDuration - 10) * minute);
        expect(promptDismissed).toHaveBeenCalledWith(willEndSoonAt);

        rerender({init_at: 1, start_at: startAt, end_at: 0, prompt_dismissed_at: willEndSoonAt});
        expect(screen.queryByTestId('recording-will-end-soon')).toBeNull();
    });
});
