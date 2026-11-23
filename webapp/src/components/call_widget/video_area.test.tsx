// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {render, screen} from '@testing-library/react';
import React from 'react';

import VideoArea from './video_area';

jest.mock('src/components/video_tile', () => ({
    __esModule: true,
    default: ({sessionID, size, isSelf, hideMuteState, className}: {sessionID: string; size: string; isSelf?: boolean; hideMuteState?: boolean; className?: string}) => (
        <div
            data-testid='video-tile'
            className={className}
            data-session-id={sessionID}
            data-size={size}
            data-is-self={String(Boolean(isSelf))}
            data-hide-mute-state={String(Boolean(hideMuteState))}
        />
    ),
}));

const tiles = () => screen.queryAllByTestId('video-tile').map((tile) => ({
    sessionID: tile.dataset.sessionId,
    size: tile.dataset.size,
    isSelf: tile.dataset.isSelf,
    hideMuteState: tile.dataset.hideMuteState,
}));

describe('VideoArea', () => {
    test('renders the other person large and the self-view small without a mute state', () => {
        render(
            <VideoArea
                otherSessionID='other-session'
                selfSessionID='self-session'
            />,
        );

        expect(tiles()).toEqual([
            {sessionID: 'other-session', size: 'large', isSelf: 'false', hideMuteState: 'false'},
            {sessionID: 'self-session', size: 'small', isSelf: 'true', hideMuteState: 'true'},
        ]);
    });

    test('renders the self-view large when nobody else is in the call yet', () => {
        render(<VideoArea selfSessionID='self-session'/>);

        expect(tiles()).toEqual([{sessionID: 'self-session', size: 'large', isSelf: 'true', hideMuteState: 'true'}]);
    });

    test('keeps the same self-view element when the other person joins, so it can animate to the corner', () => {
        const {rerender} = render(<VideoArea selfSessionID='self-session'/>);
        const selfView = screen.getByTestId('video-tile');
        expect(selfView).toHaveClass('CallWidgetVideoArea__selfView', 'CallWidgetVideoArea__selfView--alone');

        rerender(
            <VideoArea
                otherSessionID='other-session'
                selfSessionID='self-session'
            />,
        );

        const [remote, self] = screen.getAllByTestId('video-tile');
        expect(self).toBe(selfView);
        expect(self).not.toHaveClass('CallWidgetVideoArea__selfView--alone');
        expect(remote).toHaveClass('CallWidgetVideoArea__remote');
    });
});
