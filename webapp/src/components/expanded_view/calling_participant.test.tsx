// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {render} from '@testing-library/react';
import React from 'react';
import {Provider} from 'react-redux';
import RestClient from 'src/rest_client';
import {mockStore} from 'src/testUtils';

import {TileSize} from './call_participant';
import {CallingParticipant} from './calling_participant';

// The tile reuses styled components from call_participant, which pulls in the host controls menu
// and with it @floating-ui, whose UMD build doesn't load under jest.
jest.mock('src/components/dot_menu/dot_menu', () => ({
    __esModule: true,
    default: 'div',
    DotMenuButton: 'div',
    DropdownMenu: 'div',
}));

const calleeID = 'callee-user-id';

const stubState = (profiles: Record<string, unknown>) => ({
    entities: {
        users: {
            currentUserId: 'current-user-id',
            profiles,
        },
    },
});

const renderTile = (state: ReturnType<typeof stubState>) => {
    const {container} = render(
        <Provider store={mockStore(state)}>
            <CallingParticipant
                userID={calleeID}
                size={TileSize.ExtraLarge}
            />
        </Provider>,
    );
    return container;
};

describe('CallingParticipant', () => {
    beforeEach(() => {
        jest.spyOn(RestClient, 'getProfilesByIds').mockResolvedValue([]);
    });

    it('should show the callee name and avatar', () => {
        const container = renderTile(stubState({
            [calleeID]: {id: calleeID, username: 'callee', first_name: 'Arjun', last_name: 'Patel'},
        }));

        expect(container.textContent).toBe('Arjun Patel');
        expect(container.querySelector('img')).toHaveAttribute('src', expect.stringContaining(calleeID));
    });

    it('should pulse in step with the calling label', () => {
        const container = renderTile(stubState({
            [calleeID]: {id: calleeID, username: 'callee'},
        }));

        expect(container.querySelector('[data-testid="calling-participant"]')).toHaveClass('callsCallingPulse');
    });

    it('should show the avatar and fetch the name when the callee profile has not loaded', () => {
        // A popout starts with an empty store, and the callee has no session in the call for
        // loadCallState to have fetched their profile from.
        const container = renderTile(stubState({}));

        expect(container.querySelector('img')).toHaveAttribute('src', expect.stringContaining(calleeID));
        expect(RestClient.getProfilesByIds).toHaveBeenCalledWith([calleeID]);
    });
});
