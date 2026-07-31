// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Channel} from '@mattermost/types/channels';
import type {Post} from '@mattermost/types/posts';
import type {UserProfile} from '@mattermost/types/users';
import {render, screen} from '@testing-library/react';
import React from 'react';
import {createIntl, RawIntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {mockStore} from 'src/testUtils';
import {CallPostStatus} from 'src/types/types';

import PostType from './component';

// The dot menu pulls in @floating-ui, whose UMD build doesn't load under jest. None of these cases
// open the host's leave menu, so the card only needs the styled-component base back.
jest.mock('src/components/dot_menu/dot_menu', () => ({
    __esModule: true,
    default: ({children}: {children: React.ReactNode}) => <div>{children}</div>,
    DotMenuButton: 'div',
    DropdownMenu: 'div',
    DropdownMenuItem: 'div',
    DropdownMenuSeparator: () => null,
}));

const intl = createIntl({locale: 'en', messages: {}});

const channelID = 'dm-channel-id';
const callID = 'call-id';
const callerID = 'user-id';
const calleeID = 'other-user-id';

const caller = {id: callerID, username: 'caller', first_name: 'First1', last_name: 'Last1', roles: ''} as UserProfile;
const callee = {id: calleeID, username: 'callee', first_name: 'First2', last_name: 'Last2', roles: ''} as UserProfile;

const dmChannel = {
    id: channelID,
    name: `${callerID}__${calleeID}`,
    display_name: 'Callee',
    type: 'D',
} as Channel;

const state = {
    'plugins-com.mattermost.calls': {
        calls: {
            [channelID]: {ID: callID, channelID, startAt: 1000, ownerID: callerID, threadID: ''},
        },
        clientStateReducer: {channelID: ''},
    },
    entities: {
        channels: {channels: {[channelID]: dmChannel}},
        users: {
            currentUserId: callerID,
            profiles: {[callerID]: caller, [calleeID]: callee},
        },
    },
};

const stubPost = (props: Record<string, unknown>) => ({
    id: 'post-id',
    user_id: callerID,
    channel_id: channelID,
    props,
} as Post);

type RenderOpts = {
    connected?: boolean;
    profiles?: UserProfile[];

    // Defaults to one session per loaded profile, which is the usual case. Pass it explicitly to
    // model a call whose sessions are known but whose profiles haven't been fetched yet.
    numSessions?: number;

    // Which side of the call is looking at the card. Defaults to the caller's.
    isCaller?: boolean;
}

const renderCard = (post: Post, {connected = false, profiles = [caller], numSessions, isCaller = true}: RenderOpts = {}) => render(
    <Provider store={mockStore(state)}>
        <RawIntlProvider value={intl}>
            <PostType
                post={post}
                connectedID={connected ? channelID : ''}
                profiles={profiles}
                numSessions={numSessions ?? profiles.length}
                isCloudPaid={false}
                maxParticipants={0}
                militaryTime={false}
                compactDisplay={false}
                isRHS={false}
                isHost={false}
                isCaller={isCaller}
            />
        </RawIntlProvider>
    </Provider>,
);

describe('PostType', () => {
    test('a ringing call, seen by the caller who is in it', () => {
        renderCard(stubPost({start_at: Date.now(), call_status: CallPostStatus.Calling}), {connected: true});

        expect(screen.getByText('Calling…')).toBeInTheDocument();
        expect(screen.queryByText('Call started')).not.toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Cancel call'})).toHaveTextContent('Cancel');
    });

    test('a ringing call, seen by the callee who has not joined', () => {
        renderCard(stubPost({start_at: Date.now(), call_status: CallPostStatus.Calling}), {isCaller: false});

        expect(screen.getByText('Incoming call…')).toBeInTheDocument();
        expect(screen.queryByText('Calling…')).not.toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Join'})).toHaveTextContent('Join');
        expect(screen.queryByRole('button', {name: 'Cancel call'})).not.toBeInTheDocument();
    });

    // The card's icons are svgs with a role of img too, so avatars have to be matched on the alt
    // text Avatar gives them. Whether the row actually stays inline is a container query, which
    // jsdom won't evaluate — the divider standing in for it is as close as this can get.
    test('a ringing call renders as one row, with no avatars and no row divider', () => {
        renderCard(stubPost({start_at: Date.now(), call_status: CallPostStatus.Calling}), {connected: true});

        expect(screen.queryAllByAltText('user profile image')).toHaveLength(0);
        expect(screen.queryByRole('separator')).not.toBeInTheDocument();
    });

    test('an answered call shows the participants and can stack onto two rows', () => {
        renderCard(
            stubPost({start_at: Date.now(), call_status: CallPostStatus.Calling}),
            {connected: true, profiles: [caller, callee]},
        );

        expect(screen.getAllByAltText('user profile image')).toHaveLength(2);
        expect(screen.getByRole('separator')).toBeInTheDocument();
    });

    test('a ringing call goes active once the callee joins, even though call_status still says calling', () => {
        renderCard(
            stubPost({start_at: Date.now(), call_status: CallPostStatus.Calling}),
            {connected: true, profiles: [caller, callee]},
        );

        expect(screen.getByText('Call started')).toBeInTheDocument();
        expect(screen.queryByText('Calling…')).not.toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Leave call'})).toHaveTextContent('Leave');
    });

    test('an answered call stays active when the other participant\'s profile has not loaded', () => {
        renderCard(
            stubPost({start_at: Date.now(), call_status: CallPostStatus.Calling}),
            {connected: true, profiles: [caller], numSessions: 2},
        );

        expect(screen.getByText('Call started')).toBeInTheDocument();
        expect(screen.queryByText('Calling…')).not.toBeInTheDocument();
    });

    test('an ongoing call with no status, as GM and channel calls always have', () => {
        renderCard(stubPost({start_at: Date.now()}), {connected: true});

        expect(screen.getByText('Call started')).toBeInTheDocument();
        expect(screen.getByText(/by First1 Last1/)).toBeInTheDocument();
    });

    test('a call nobody answered, seen by the caller', () => {
        renderCard(stubPost({start_at: 1000, end_at: 31000, call_status: CallPostStatus.NoAnswer}));

        expect(screen.getByText('Call ended')).toBeInTheDocument();
        expect(screen.getByText('No answer')).toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    test('a call nobody answered, seen by the callee who missed it', () => {
        renderCard(stubPost({start_at: 1000, end_at: 31000, call_status: CallPostStatus.NoAnswer}), {isCaller: false});

        expect(screen.getByText('Call ended')).toBeInTheDocument();
        expect(screen.getByText('Missed call')).toBeInTheDocument();
        expect(screen.queryByText('No answer')).not.toBeInTheDocument();
    });

    test('a canceled call, seen by the caller who canceled it', () => {
        renderCard(stubPost({start_at: 1000, end_at: 5000, call_status: CallPostStatus.CanceledByCaller}));

        expect(screen.getByText('Call ended')).toBeInTheDocument();
        expect(screen.getByText('You canceled the call')).toBeInTheDocument();
    });

    test('a canceled call, seen by the callee who is told who canceled it', () => {
        renderCard(stubPost({start_at: 1000, end_at: 5000, call_status: CallPostStatus.CanceledByCaller}), {isCaller: false});

        expect(screen.getByText('Call ended')).toBeInTheDocument();
        expect(screen.getByText('Canceled by First1 Last1')).toBeInTheDocument();
    });

    test('a call the callee declined falls back to the plain ended card, pending the decline UI', () => {
        renderCard(stubPost({start_at: 1000, end_at: 1000 + (5 * 60 * 1000), call_status: CallPostStatus.Declined}));

        expect(screen.getByText('Call ended')).toBeInTheDocument();
        expect(screen.getByText('Lasted 5 minutes')).toBeInTheDocument();
    });

    test('a call that ended normally reports its duration', () => {
        renderCard(stubPost({start_at: 1000, end_at: 1000 + (22 * 60 * 1000), call_status: CallPostStatus.Ended}));

        expect(screen.getByText('Call ended')).toBeInTheDocument();
        expect(screen.getByText(/Ended at/)).toBeInTheDocument();
        expect(screen.getByText('Lasted 22 minutes')).toBeInTheDocument();
    });
});
