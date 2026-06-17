// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {render, screen} from '@testing-library/react';
import React from 'react';
import {createIntl} from 'react-intl';

// media-chrome ships ESM that jest doesn't transform; it's only used by the
// full render path, not the recording badge under test.
jest.mock('media-chrome/dist/react', () => ({
    MediaControlBar: 'div',
    MediaController: 'div',
    MediaFullscreenButton: 'div',
}));

// dot_menu transitively imports @floating-ui's UMD build, which doesn't load
// under jest; it isn't needed by the recording badge.
jest.mock('src/components/dot_menu/dot_menu', () => ({
    __esModule: true,
    default: 'div',
    DotMenuButton: 'div',
    DropdownMenu: 'div',
}));

import ExpandedView from './component';

type Props = React.ComponentProps<typeof ExpandedView>;

const intl = createIntl({locale: 'en', messages: {}});

const renderRecordingBadge = (overrides: Partial<Props>) => {
    const props = {
        intl,
        theme: {sidebarBg: '#ffffff'},
        currentUserID: 'user-1',
        callHostID: 'user-1',
        callRecording: {init_at: 100, start_at: 200, end_at: 0, err: ''},
        ...overrides,
    } as Props;

    // The badge helper only reads props (callRecording, callHostID,
    // currentUserID, intl), so we can exercise it without a full mount.
    const view = new ExpandedView(props);
    render(<>{view.renderRecordingBadge()}</>);
};

describe('renderRecordingBadge', () => {
    it('host sees a clickable "stop recording" button', () => {
        renderRecordingBadge({callHostID: 'user-1', currentUserID: 'user-1'});

        expect(screen.getByText('REC')).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Click to stop recording'})).toBeInTheDocument();
    });

    it('non-host sees the static badge with no stop button', () => {
        renderRecordingBadge({callHostID: 'host-user', currentUserID: 'user-1'});

        expect(screen.getByText('REC')).toBeInTheDocument();
        expect(screen.queryByRole('button', {name: 'Click to stop recording'})).not.toBeInTheDocument();
    });
});
