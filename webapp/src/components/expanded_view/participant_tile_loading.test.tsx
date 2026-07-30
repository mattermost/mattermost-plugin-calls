// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {UserProfile} from '@mattermost/types/users';
import {fireEvent, render, screen} from '@testing-library/react';
import React from 'react';

import {TileSize} from './participant_cell';
import {ParticipantTileLoading} from './participant_tile_loading';

// The tile takes its sizes from participant_cell, which pulls in the host controls menu and with it
// @floating-ui, whose UMD build doesn't load under jest.
jest.mock('src/components/dot_menu/dot_menu', () => ({
    __esModule: true,
    default: 'div',
    DotMenuButton: 'div',
    DropdownMenu: 'div',
}));

const calleeID = 'callee-user-id';

const stubCallee = (overrides: Partial<UserProfile> = {}) => ({
    id: calleeID,
    username: 'callee',
    first_name: 'First1',
    last_name: 'Last1',
    ...overrides,
} as UserProfile);

const renderTile = (profile?: UserProfile, tileSize = TileSize.ExtraLarge) => {
    // The tile is an <li>, so it needs the grid's list around it to be a listitem.
    const {container} = render(
        <ul>
            <ParticipantTileLoading
                userID={calleeID}
                profile={profile}
                tileSize={tileSize}
            />
        </ul>,
    );

    return {container, tile: screen.getByRole('listitem')};
};

describe('ParticipantTileLoading', () => {
    test('should show the name of the callee', () => {
        renderTile(stubCallee());

        expect(screen.getByText('First1 Last1')).toBeInTheDocument();
    });

    test('should show the avatar of the callee', () => {
        const {container} = renderTile(stubCallee());

        expect(container.querySelector('img')).toHaveAttribute('src', `/api/v4/users/${calleeID}/image`);
    });

    test('should bust the avatar cache when the picture of the callee was updated', () => {
        const {container} = renderTile(stubCallee({last_picture_update: 1706000000000}));

        expect(container.querySelector('img')).toHaveAttribute('src', expect.stringContaining('_=1706000000000'));
    });

    test('should show the avatar before the profile of the callee has loaded', () => {
        // A popout starts with an empty store, and the callee has no session in the call for
        // loadCallState to have fetched their profile from.
        const {container, tile} = renderTile();

        expect(container.querySelector('img')).toHaveAttribute('src', `/api/v4/users/${calleeID}/image`);
        expect(tile.textContent).toBe('');
    });

    test('should pulse while waiting for the callee to answer', () => {
        const {tile} = renderTile(stubCallee());

        expect(tile).toHaveClass('pulsingAnimation');
    });

    test('should show no mute state for someone who has not joined', () => {
        renderTile(stubCallee());

        expect(screen.queryByTestId('muted')).not.toBeInTheDocument();
        expect(screen.queryByTestId('unmuted')).not.toBeInTheDocument();
    });

    test('should offer no host controls, on hover or otherwise', () => {
        const {tile} = renderTile(stubCallee());

        fireEvent.mouseEnter(tile);

        expect(screen.queryByTestId('three-dots-button')).not.toBeInTheDocument();
    });

    test.each([
        ['a small', TileSize.Small, '96px', '12px', '8px'],
        ['a medium', TileSize.Medium, '128px', '16px', '12px'],
        ['a large', TileSize.Large, '160px', '20px', '12px'],
        ['an extra large', TileSize.ExtraLarge, '208px', '26px', '12px'],
    ])('should lay out %s tile the same way a joined participant is laid out', (_, tileSize, width, padding, gap) => {
        // Matching participant_cell keeps the grid from shifting when the callee answers.
        const {tile} = renderTile(stubCallee(), tileSize);

        expect(tile).toHaveStyle({width, padding, gap});
    });
});
