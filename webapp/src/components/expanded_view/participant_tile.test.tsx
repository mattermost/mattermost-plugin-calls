// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Reaction, UserSessionState} from '@mattermost/calls-common/lib/types';
import {UserProfile} from '@mattermost/types/users';
import {IDMappedObjects} from '@mattermost/types/utilities';
import {render} from '@testing-library/react';
import React from 'react';
import {createIntl, RawIntlProvider} from 'react-intl';

import {Props as CellProps, TileSize} from './participant_cell';
import {ParticipantTile} from './participant_tile';

// The dot menu pulls in @floating-ui, whose UMD build doesn't load under jest.
jest.mock('src/components/dot_menu/dot_menu', () => ({
    __esModule: true,
    default: 'div',
    DotMenuButton: 'div',
    DropdownMenu: 'div',
}));

const mockCell = jest.fn();

// The tile's whole job is turning a session and a profile map into cell props, so the cell stands in
// as a probe. Everything else in the module (TileSize, the size map) stays real.
jest.mock('./participant_cell', () => ({
    ...jest.requireActual('./participant_cell'),
    __esModule: true,
    default: (props: CellProps) => {
        mockCell(props);
        return null;
    },
}));

const intl = createIntl({locale: 'en', messages: {}});

const hostID = 'host-user-id';
const myUserID = 'my-user-id';
const mySessionID = 'my-session-id';
const theirUserID = 'their-user-id';
const theirSessionID = 'their-session-id';

const stubSession = (overrides: Partial<UserSessionState> = {}) => ({
    session_id: theirSessionID,
    user_id: theirUserID,
    unmuted: false,
    voice: false,
    raised_hand: 0,
    ...overrides,
} as UserSessionState);

const stubProfile = (overrides: Partial<UserProfile> = {}) => ({
    id: theirUserID,
    username: 'participant',
    first_name: 'First1',
    last_name: 'Last1',
    ...overrides,
} as UserProfile);

type Props = React.ComponentProps<typeof ParticipantTile>;

const renderTile = (props: Partial<Props> = {}) => {
    const onParticipantRemove = jest.fn();

    const rendered = render(
        <RawIntlProvider value={intl}>
            <ParticipantTile
                session={stubSession()}
                profiles={{[theirUserID]: stubProfile()}}
                tileSize={TileSize.Medium}
                currentSessionID={mySessionID}
                currentUserID={myUserID}
                callHostID={hostID}
                callID={'call-id'}
                onParticipantRemove={onParticipantRemove}
                {...props}
            />
        </RawIntlProvider>,
    );

    return {...rendered, onParticipantRemove};
};

// Jest 27 has no mock.lastCall, and a re-render would add a second call.
const cellProps = (): CellProps => mockCell.mock.calls[mockCell.mock.calls.length - 1][0];

describe('ParticipantTile', () => {
    test('should show the display name of the participant', () => {
        renderTile();

        expect(cellProps().name).toBe('First1 Last1');
    });

    test('should fall back to the username when the participant has no full name', () => {
        renderTile({profiles: {[theirUserID]: stubProfile({first_name: '', last_name: ''})}});

        expect(cellProps().name).toBe('participant');
    });

    test('should mark my own tile as mine', () => {
        renderTile({session: stubSession({session_id: mySessionID, user_id: myUserID}),
            profiles: {[myUserID]: stubProfile({id: myUserID})}});

        expect(cellProps().name).toBe('First1 Last1 (you)');
        expect(cellProps().isYou).toBe(true);
    });

    test('should not mark another session of mine as mine', () => {
        // Joining from a second device gives me the same user but a different session.
        renderTile({session: stubSession({session_id: 'my-other-session-id', user_id: myUserID}),
            profiles: {[myUserID]: stubProfile({id: myUserID})}});

        expect(cellProps().name).toBe('First1 Last1');
        expect(cellProps().isYou).toBe(false);
    });

    test('should render nothing while the profile of the participant is still loading', () => {
        const {container} = renderTile({profiles: {}});

        expect(mockCell).not.toHaveBeenCalled();
        expect(container).toBeEmptyDOMElement();
    });

    test('should render nothing before any profile has arrived', () => {
        // The popout mounts against an empty store, so profiles can be missing outright.
        const {container} = renderTile({profiles: undefined as unknown as IDMappedObjects<UserProfile>});

        expect(mockCell).not.toHaveBeenCalled();
        expect(container).toBeEmptyDOMElement();
    });

    test('should treat a session that is not unmuted as muted', () => {
        renderTile({session: stubSession({unmuted: false})});

        expect(cellProps().isMuted).toBe(true);
    });

    test('should treat an unmuted session as unmuted', () => {
        renderTile({session: stubSession({unmuted: true})});

        expect(cellProps().isMuted).toBe(false);
    });

    test('should report a session with voice activity as speaking', () => {
        renderTile({session: stubSession({voice: true})});

        expect(cellProps().isSpeaking).toBe(true);
    });

    test('should report a quiet session as not speaking', () => {
        renderTile({session: stubSession({voice: false})});

        expect(cellProps().isSpeaking).toBe(false);
    });

    test('should report a hand raised at some point in time as raised', () => {
        renderTile({session: stubSession({raised_hand: 1706000000000})});

        expect(cellProps().isHandRaised).toBe(true);
    });

    test('should report a hand that was never raised as lowered', () => {
        renderTile({session: stubSession({raised_hand: 0})});

        expect(cellProps().isHandRaised).toBe(false);
    });

    test('should pass on the reaction of the participant', () => {
        const reaction = {emoji: {name: 'tada', unified: '1f389'}} as Reaction;

        renderTile({session: stubSession({reaction})});

        expect(cellProps().reaction).toBe(reaction);
    });

    test('should mark the participant who is hosting the call', () => {
        renderTile({session: stubSession({user_id: hostID}), profiles: {[hostID]: stubProfile({id: hostID})}});

        expect(cellProps().isHost).toBe(true);
    });

    test('should not mark a participant who is not hosting the call', () => {
        renderTile();

        expect(cellProps().isHost).toBe(false);
    });

    test('should let the tile know when I am the host', () => {
        renderTile({currentUserID: hostID});

        expect(cellProps().iAmHost).toBe(true);
    });

    test('should let the tile know when someone else is the host', () => {
        renderTile({currentUserID: myUserID});

        expect(cellProps().iAmHost).toBe(false);
    });

    test('should not make me the host when there is no current user', () => {
        // The recorder renders the grid without a current user of its own, and a call it joins early
        // enough has no host yet either — an absent user must not match an absent host.
        // eslint-disable-next-line no-undefined
        renderTile({currentUserID: undefined, callHostID: undefined as unknown as string});

        expect(cellProps().iAmHost).toBe(false);
    });

    test('should build the avatar URL for the participant', () => {
        renderTile({profiles: {[theirUserID]: stubProfile({last_picture_update: 1706000000000})}});

        expect(cellProps().pictureURL).toBe(`/api/v4/users/${theirUserID}/image?_=1706000000000`);
    });

    test('should use the images handed to it when rendering for the recorder', () => {
        renderTile({profileImages: {[theirUserID]: 'blob:their-avatar'}});

        expect(cellProps().pictureURL).toBe('blob:their-avatar');
    });

    test('should leave the avatar unset when the recorder has no image for the participant', () => {
        // Client4 has no credentials for the bot endpoint the recorder fetches avatars through, so a
        // missing blob has to hide the tile rather than fall back to a URL that would 401.
        renderTile({profileImages: {}});

        expect(cellProps().pictureURL).toBeUndefined();
    });

    test('should pass on the size the grid picked for the tile', () => {
        renderTile({tileSize: TileSize.ExtraLarge});

        expect(cellProps().size).toBe(TileSize.ExtraLarge);
    });

    test('should remove the participant by session and user when the host asks for it', () => {
        const {onParticipantRemove} = renderTile();

        cellProps().onRemove();

        expect(onParticipantRemove).toHaveBeenCalledWith(theirSessionID, theirUserID);
    });

    test('should do nothing on removal when the grid gave it no way to remove anyone', () => {
        // eslint-disable-next-line no-undefined
        renderTile({onParticipantRemove: undefined});

        expect(() => cellProps().onRemove()).not.toThrow();
    });
});
