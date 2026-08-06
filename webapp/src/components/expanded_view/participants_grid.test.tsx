// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {UserSessionState} from '@mattermost/calls-common/lib/types';
import {UserProfile} from '@mattermost/types/users';
import {render, screen} from '@testing-library/react';
import React from 'react';
import {useDMCallingState} from 'src/components/use_dm_calling_state';

import {ParticipantsGrid} from './participants_grid';

// The grid reaches participant_cell for TileSize, which pulls in @floating-ui, whose UMD build
// doesn't load under jest.
jest.mock('src/components/dot_menu/dot_menu', () => ({
    __esModule: true,
    default: 'div',
    DotMenuButton: 'div',
    DropdownMenu: 'div',
    DropdownMenuItem: 'div',
}));

// Each tile has its own tests; here they only have to say who they were pointed at.
jest.mock('./participant_tile', () => ({
    ParticipantTile: ({session}: { session: UserSessionState }) => (
        <li data-testid={'participant-tile'}>{session.user_id}</li>
    ),
}));

jest.mock('./participant_tile_loading', () => ({
    ParticipantTileLoading: ({userID}: { userID?: string }) => (
        <li data-testid={'participant-tile-loading'}>{userID}</li>
    ),
}));

jest.mock('src/components/use_dm_calling_state', () => ({
    useDMCallingState: jest.fn(),
}));

const callerID = 'caller-user-id';
const calleeID = 'callee-user-id';
const callee = {id: calleeID, username: 'callee'} as UserProfile;

const session = (userID: string, sessionID: string) => ({
    session_id: sessionID,
    user_id: userID,
} as UserSessionState);

type DMCallingState = {
    isDMCalling: boolean;
    dmCalleeID?: string;
    dmCallee?: UserProfile;
};

const renderGrid = (sessions: UserSessionState[], dmCallingState: DMCallingState = {isDMCalling: false}) => {
    (useDMCallingState as jest.Mock).mockReturnValue(dmCallingState);

    return render(
        <ParticipantsGrid
            callID={'call-id'}
            callHostID={callerID}
            currentSessionID={'caller-session-id'}
            currentUserID={callerID}
            profiles={{}}
            sessions={sessions}
        />,
    );
};

describe('ParticipantsGrid', () => {
    beforeAll(() => {
        // jsdom has no ResizeObserver, which the grid uses to recompute its tile size.
        window.ResizeObserver = class {
            observe() { /* no-op */ }
            unobserve() { /* no-op */ }
            disconnect() { /* no-op */ }
        };
    });

    test('should show a tile per session in the call', () => {
        renderGrid([session(callerID, 'caller-session-id'), session(calleeID, 'callee-session-id')]);

        expect(screen.getAllByTestId('participant-tile')).toHaveLength(2);
        expect(screen.queryByTestId('participant-tile-loading')).not.toBeInTheDocument();
    });

    test('should show a placeholder tile for the callee while a DM call is still ringing', () => {
        renderGrid(
            [session(callerID, 'caller-session-id')],
            {isDMCalling: true, dmCalleeID: calleeID, dmCallee: callee},
        );

        expect(screen.getAllByTestId('participant-tile')).toHaveLength(1);
        expect(screen.getByTestId('participant-tile-loading')).toHaveTextContent(calleeID);
    });
});
