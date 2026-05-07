// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {render, screen} from '@testing-library/react';
import React from 'react';

import CallDuration from './call_duration';

describe('CallDuration', () => {
    it('should display 00:00 when startAt is in the future (server clock ahead)', () => {
        const futureStartAt = Date.now() + 60_000;
        render(<CallDuration startAt={futureStartAt}/>);
        expect(screen.getByText('00:00')).toBeInTheDocument();
    });

    it('should not display negative time when startAt is in the future', () => {
        const futureStartAt = Date.now() + 180_000;
        const {container} = render(<CallDuration startAt={futureStartAt}/>);
        expect(container.textContent).not.toMatch(/-/);
    });

    it('should display positive duration when startAt is in the past', () => {
        const pastStartAt = Date.now() - 65_000;
        const {container} = render(<CallDuration startAt={pastStartAt}/>);
        const text = container.textContent || '';
        expect(text).toMatch(/^01:0[45]$/);
    });

    it('should display hh:mm:ss format for durations over one hour', () => {
        const pastStartAt = Date.now() - (3600_000 + 120_000);
        const {container} = render(<CallDuration startAt={pastStartAt}/>);
        const text = container.textContent || '';
        expect(text).toMatch(/^01:02:0\d$/);
    });

    it('should re-sync when startAt prop changes', () => {
        // Start with a future timestamp (server clock ahead).
        const futureStartAt = Date.now() + 60_000;
        const {container, rerender} = render(<CallDuration startAt={futureStartAt}/>);
        expect(container.textContent).toBe('00:00');
        expect(container.textContent).not.toMatch(/-/);

        // Rerender with a past timestamp (e.g. reconnect with corrected time).
        const pastStartAt = Date.now() - 90_000;
        rerender(<CallDuration startAt={pastStartAt}/>);
        const text = container.textContent || '';
        expect(text).toMatch(/^01:3\d$/);
        expect(text).not.toMatch(/-/);
    });
});
