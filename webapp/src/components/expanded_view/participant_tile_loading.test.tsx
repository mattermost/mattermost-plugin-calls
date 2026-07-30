// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {UserProfile} from '@mattermost/types/users';
import {fireEvent, render, screen} from '@testing-library/react';
import React from 'react';

import {TileSize} from './participant_cell';
import {ParticipantTileLoading} from './participant_tile_loading';

// The tile reuses styled components from participant_cell, which pulls in the host controls menu
// and with it @floating-ui, whose UMD build doesn't load under jest.
jest.mock('src/components/dot_menu/dot_menu', () => ({
    __esModule: true,
    default: 'div',
    DotMenuButton: 'div',
    DropdownMenu: 'div',
}));

const calleeID = 'callee-user-id';
const callee = {id: calleeID, username: 'callee', first_name: 'Arjun', last_name: 'Patel'} as UserProfile;

const renderTile = (profile?: UserProfile) => {
    const {container} = render(
        <ParticipantTileLoading
            userID={calleeID}
            profile={profile}
            tileSize={TileSize.ExtraLarge}
        />,
    );
    return {container, tile: screen.getByTestId('participant-dm-callee-tile')};
};

describe('ParticipantDMCalleeTile', () => {
    test('should show the callee name and avatar', () => {
        const {container} = renderTile(callee);

        expect(container.textContent).toBe('Arjun Patel');
        expect(container.querySelector('img')).toHaveAttribute('src', expect.stringContaining(calleeID));
    });

    test('should pulse in step with the calling label', () => {
        const {tile} = renderTile(callee);

        expect(tile).toHaveClass('callsCallingPulse');
    });

    test('should show no mute state for someone who has not joined', () => {
        renderTile(callee);

        expect(screen.queryByTestId('muted')).not.toBeInTheDocument();
        expect(screen.queryByTestId('unmuted')).not.toBeInTheDocument();
    });

    test('should offer no host controls, on hover or otherwise', () => {
        const {tile} = renderTile(callee);

        fireEvent.mouseEnter(tile);

        expect(screen.queryByTestId('three-dots-button')).not.toBeInTheDocument();
    });

    test('should show the avatar while the callee profile is still loading', () => {
        // A popout starts with an empty store, and the callee has no session in the call for
        // loadCallState to have fetched their profile from.
        const {container} = renderTile();

        expect(container.querySelector('img')).toHaveAttribute('src', expect.stringContaining(calleeID));
        expect(container.textContent).toBe('');
    });
});
