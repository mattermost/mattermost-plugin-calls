// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Reaction} from '@mattermost/calls-common/lib/types';
import {fireEvent, render, screen} from '@testing-library/react';
import React from 'react';
import {createIntl, RawIntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {mockStore} from 'src/testUtils';

import ParticipantCell, {Props, TileSize} from './participant_cell';

// The dot menu pulls in @floating-ui, whose UMD build doesn't load under jest. The fake also gives
// the test a way to say "the menu was opened", which is what makes the controls stick.
jest.mock('src/components/dot_menu/dot_menu', () => ({
    __esModule: true,
    default: ({icon, children, onOpenChange}: {
        icon: React.ReactNode;
        children: React.ReactNode;
        onOpenChange: (open: boolean) => void;
    }) => (
        <div>
            {icon}
            <button
                data-testid={'open-host-menu'}
                onClick={() => onOpenChange(true)}
            />
            {children}
        </div>
    ),
    DotMenuButton: 'div',
    DropdownMenu: 'div',
}));

// The menu's own items belong to its tests; here it only has to report which participant the cell
// pointed it at, and offer the remove action back.
jest.mock('src/components/host_controls_menu', () => ({
    HostControlsMenu: ({callID, userID, sessionID, onRemove}: {
        callID?: string;
        userID: string;
        sessionID: string;
        onRemove: () => void;
    }) => (
        <button
            data-testid={'host-controls-menu'}
            data-call-id={callID}
            data-user-id={userID}
            data-session-id={sessionID}
            onClick={onRemove}
        />
    ),
}));

const intl = createIntl({locale: 'en', messages: {}});

const userID = 'participant-user-id';

const baseProps: Omit<Props, 'onRemove'> = {
    name: 'First1 Last1',
    size: TileSize.Medium,
    pictureURL: `/api/v4/users/${userID}/image`,
    isMuted: true,
    isHandRaised: false,
    isSpeaking: false,
    isYou: false,
    isHost: false,
    iAmHost: false,
    callID: 'call-id',
    userID,
    sessionID: 'participant-session-id',
};

type StoreOpts = {
    hostControlsAllowed?: boolean;
    iAmAdmin?: boolean;
};

// useHostControls reads the plugin config and the current user's roles straight off the store, so
// both slices have to be modelled rather than left as the default empty stub.
const stubState = ({hostControlsAllowed = true, iAmAdmin = false}: StoreOpts) => ({
    'plugins-com.mattermost.calls': {
        callsConfig: {HostControlsAllowed: hostControlsAllowed},
    },
    entities: {
        users: {
            currentUserId: 'my-user-id',
            profiles: {
                'my-user-id': {
                    id: 'my-user-id',
                    roles: iAmAdmin ? 'system_user system_admin' : 'system_user',
                },
            },
        },
    },
});

const renderCell = (props: Partial<Props> = {}, storeOpts: StoreOpts = {}) => {
    const onRemove = jest.fn();

    // The cell is an <li>, so it needs the grid's list around it to be a listitem.
    const rendered = render(
        <Provider store={mockStore(stubState(storeOpts))}>
            <RawIntlProvider value={intl}>
                <ul>
                    <ParticipantCell
                        {...baseProps}
                        onRemove={onRemove}
                        {...props}
                    />
                </ul>
            </RawIntlProvider>
        </Provider>,
    );

    return {...rendered, onRemove};
};

const hoverOverTile = () => fireEvent.mouseEnter(screen.getByRole('listitem'));

describe('ParticipantCell', () => {
    test('should render nothing until the profile picture is known', () => {
        // eslint-disable-next-line no-undefined
        renderCell({pictureURL: undefined});

        expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    });

    test('should show the name of the participant', () => {
        renderCell({name: 'First1 Last1 (you)'});

        expect(screen.getByText('First1 Last1 (you)')).toBeInTheDocument();
    });

    test('should show the profile picture of the participant', () => {
        const {container} = renderCell();

        expect(container.querySelector('img')).toHaveAttribute('src', `/api/v4/users/${userID}/image`);
    });

    test('should show a muted participant as muted', () => {
        renderCell({isMuted: true});

        expect(screen.getByTestId('muted')).toBeInTheDocument();
        expect(screen.queryByTestId('unmuted')).not.toBeInTheDocument();
    });

    test('should show an unmuted participant as unmuted', () => {
        renderCell({isMuted: false});

        expect(screen.getByTestId('unmuted')).toBeInTheDocument();
        expect(screen.queryByTestId('muted')).not.toBeInTheDocument();
    });

    test('should ring the avatar of a participant who is speaking', () => {
        const {container} = renderCell({isSpeaking: true});

        expect(window.getComputedStyle(container.querySelector('img')!).boxShadow).not.toBe('none');
    });

    test('should leave the avatar of a silent participant unringed', () => {
        const {container} = renderCell({isSpeaking: false});

        expect(window.getComputedStyle(container.querySelector('img')!).boxShadow).toBe('none');
    });

    test('should show a raised hand', () => {
        renderCell({isHandRaised: true});

        expect(screen.getByTestId('raised-hand')).toBeInTheDocument();
    });

    test('should show a reaction', () => {
        renderCell({reaction: {emoji: {name: 'tada', unified: '1f389'}} as Reaction});

        expect(screen.getByText('tada')).toBeInTheDocument();
    });

    test('should keep showing the raised hand when a reaction lands while the hand is up', () => {
        renderCell({
            isHandRaised: true,
            reaction: {emoji: {name: 'tada', unified: '1f389'}} as Reaction,
        });

        expect(screen.getByTestId('raised-hand')).toBeInTheDocument();
        expect(screen.queryByText('tada')).not.toBeInTheDocument();
    });

    test('should badge the host of the call', () => {
        renderCell({isHost: true});

        expect(screen.getByTestId('host-badge')).toBeInTheDocument();
    });

    test('should not badge anyone who is not the host', () => {
        renderCell({isHost: false});

        expect(screen.queryByTestId('host-badge')).not.toBeInTheDocument();
    });

    test.each([
        ['a small', TileSize.Small, '96px', '12px', '8px'],
        ['a medium', TileSize.Medium, '128px', '16px', '12px'],
        ['a large', TileSize.Large, '160px', '20px', '12px'],
        ['an extra large', TileSize.ExtraLarge, '208px', '26px', '12px'],
    ])('should lay out %s tile around its avatar', (_, size, width, padding, gap) => {
        renderCell({size});

        expect(screen.getByRole('listitem')).toHaveStyle({width, padding, gap});
    });

    test('should lay out a tile the same way when it carries host controls', () => {
        renderCell({size: TileSize.Medium, iAmHost: true});

        expect(screen.getByRole('listitem')).toHaveStyle({width: '128px', padding: '16px', gap: '12px'});
    });

    test('should offer no host controls when the server does not allow them', () => {
        renderCell({iAmHost: true}, {hostControlsAllowed: false});

        hoverOverTile();

        expect(screen.queryByTestId('three-dots-button')).not.toBeInTheDocument();
    });

    test('should offer no host controls before the pointer reaches the tile', () => {
        renderCell({iAmHost: true});

        expect(screen.queryByTestId('three-dots-button')).not.toBeInTheDocument();
    });

    test('should offer host controls on hover when I am the host', () => {
        renderCell({iAmHost: true});

        hoverOverTile();

        expect(screen.getByTestId('three-dots-button')).toBeInTheDocument();
    });

    test('should offer host controls on hover when I am a system admin', () => {
        renderCell({iAmHost: false}, {iAmAdmin: true});

        hoverOverTile();

        expect(screen.getByTestId('three-dots-button')).toBeInTheDocument();
    });

    test('should highlight the tile while its host controls are showing', () => {
        renderCell({iAmHost: true});

        hoverOverTile();

        expect(screen.getByRole('listitem')).toHaveClass('showHostControls');
    });

    test('should take the host controls away when the pointer leaves', () => {
        renderCell({iAmHost: true});

        hoverOverTile();
        fireEvent.mouseLeave(screen.getByRole('listitem'));

        expect(screen.queryByTestId('three-dots-button')).not.toBeInTheDocument();
    });

    test('should keep the host controls in place while their menu is open', () => {
        renderCell({iAmHost: true});

        hoverOverTile();
        fireEvent.click(screen.getByTestId('open-host-menu'));
        fireEvent.mouseLeave(screen.getByRole('listitem'));

        expect(screen.getByTestId('three-dots-button')).toBeInTheDocument();
    });

    test('should offer me no host controls on my own tile when I am the host', () => {
        renderCell({isYou: true, isHost: true, iAmHost: true});

        hoverOverTile();

        expect(screen.queryByTestId('three-dots-button')).not.toBeInTheDocument();
    });

    test('should offer me host controls on my own tile when someone else is the host', () => {
        renderCell({isYou: true, isHost: false}, {iAmAdmin: true});

        hoverOverTile();

        expect(screen.getByTestId('three-dots-button')).toBeInTheDocument();
    });

    test('should point the host controls at the session of the participant they belong to', () => {
        renderCell({iAmHost: true});

        hoverOverTile();

        expect(screen.getByTestId('host-controls-menu')).toHaveAttribute('data-call-id', 'call-id');
        expect(screen.getByTestId('host-controls-menu')).toHaveAttribute('data-user-id', userID);
        expect(screen.getByTestId('host-controls-menu')).toHaveAttribute('data-session-id', 'participant-session-id');
    });

    test('should remove the participant when the host asks for it', () => {
        const {onRemove} = renderCell({iAmHost: true});

        hoverOverTile();
        fireEvent.click(screen.getByTestId('host-controls-menu'));

        expect(onRemove).toHaveBeenCalled();
    });
});
