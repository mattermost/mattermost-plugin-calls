// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Channel} from '@mattermost/types/channels';
import type {Post} from '@mattermost/types/posts';
import type {UserProfile} from '@mattermost/types/users';
import {fireEvent, render, screen} from '@testing-library/react';
import React from 'react';
import {createIntl, RawIntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {mockStore} from 'src/testUtils';
import {CallPostStatus} from 'src/types/types';

import {PostTypeEvent} from './post_type_event';

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

const stubPost = (props: Record<string, unknown>) => ({
    id: 'post-id',
    user_id: callerID,
    channel_id: channelID,
    props,
} as Post);

type RenderOpts = {

    // Whether the viewer is connected to the call, which is what turns the card's join button into
    // a leave (or cancel) one.
    connected?: boolean;

    // Who holds a session in the call. Defaults to just the caller. A user with no profile in the
    // store models a session whose profile hasn't been fetched yet.
    sessionUserIDs?: string[];

    // Which side of the call is looking at the card. Defaults to the caller's.
    isCaller?: boolean;

    // The type of the channel the post is in. Defaults to a DM, which is the only kind of channel
    // that rings.
    channelType?: Channel['type'];

    // Which profiles have been fetched. Defaults to both sides of the DM.
    knownProfiles?: UserProfile[];

    // The participant cap, which turns the join button into a disabled one. 0 means no cap.
    maxCallParticipants?: number;

    // Whether the viewer has message display set to compact.
    compactDisplay?: boolean;
}

const stubState = ({
    connected = false,
    sessionUserIDs = [callerID],
    isCaller = true,
    channelType = 'D',
    knownProfiles = [caller, callee],
    maxCallParticipants = 0,
    compactDisplay = false,
}: RenderOpts) => ({
    'plugins-com.mattermost.calls': {
        calls: {
            [channelID]: {ID: callID, channelID, startAt: 1000, ownerID: callerID, threadID: ''},
        },
        sessions: {
            [channelID]: Object.fromEntries(sessionUserIDs.map((userID, i) => {
                const sessionID = `session-${i}`;
                return [sessionID, {session_id: sessionID, user_id: userID}];
            })),
        },
        hosts: {[channelID]: {hostID: callerID, hostChangeAt: 0}},
        callsConfig: {MaxCallParticipants: maxCallParticipants, sku_short_name: ''},
        clientStateReducer: {channelID: connected ? channelID : ''},
    },
    entities: {
        channels: {channels: {[channelID]: {...dmChannel, type: channelType}}},
        users: {
            currentUserId: isCaller ? callerID : calleeID,
            profiles: Object.fromEntries(knownProfiles.map((profile) => [profile.id, profile])),
        },

        // Read for the participant limit's upsell copy and for 12h/24h timestamps, both of which
        // these cases leave at their defaults.
        general: {license: {}},
        cloud: {subscription: {}},
        preferences: {
            myPreferences: compactDisplay ? {
                'display_settings--message_display': {
                    category: 'display_settings',
                    name: 'message_display',
                    value: 'compact',
                },
            } : {},
        },
    },
});

const renderCard = (post: Post, opts: RenderOpts = {}, isRHS = false) => render(
    <Provider store={mockStore(stubState(opts))}>
        <RawIntlProvider value={intl}>
            <PostTypeEvent
                post={post}
                isRHS={isRHS}
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

    test('an answered DM call stays on one row, with no avatars and no row divider', () => {
        renderCard(
            stubPost({start_at: Date.now(), call_status: CallPostStatus.Calling}),
            {connected: true, sessionUserIDs: [callerID, calleeID]},
        );

        expect(screen.queryAllByAltText('user profile image')).toHaveLength(0);
        expect(screen.queryByRole('separator')).not.toBeInTheDocument();
    });

    test('an answered channel call shows the participants and can stack onto two rows', () => {
        renderCard(
            stubPost({start_at: Date.now()}),
            {connected: true, sessionUserIDs: [callerID, calleeID], channelType: 'O'},
        );

        expect(screen.getAllByAltText('user profile image')).toHaveLength(2);
        expect(screen.getByRole('separator')).toBeInTheDocument();
    });

    test('a ringing call goes active once the callee joins, even though call_status still says calling', () => {
        renderCard(
            stubPost({start_at: Date.now(), call_status: CallPostStatus.Calling}),
            {connected: true, sessionUserIDs: [callerID, calleeID]},
        );

        expect(screen.getByText('Call started')).toBeInTheDocument();
        expect(screen.queryByText('Calling…')).not.toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Leave call'})).toHaveTextContent('Leave');
    });

    test('an answered call stays active when the other participant\'s profile has not loaded', () => {
        renderCard(
            stubPost({start_at: Date.now(), call_status: CallPostStatus.Calling}),
            {connected: true, sessionUserIDs: [callerID, 'unfetched-user-id']},
        );

        expect(screen.getByText('Call started')).toBeInTheDocument();
        expect(screen.queryByText('Calling…')).not.toBeInTheDocument();
    });

    test('an ongoing call with no status, as GM and channel calls always have', () => {
        renderCard(stubPost({start_at: Date.now()}), {connected: true, channelType: 'O'});

        expect(screen.getByText('Call started')).toBeInTheDocument();
        expect(screen.getByText(/by First1 Last1/)).toBeInTheDocument();
    });

    test('an ongoing DM call names nobody, since the post already says who is on it', () => {
        renderCard(
            stubPost({start_at: Date.now(), call_status: CallPostStatus.Calling}),
            {connected: true, sessionUserIDs: [callerID, calleeID]},
        );

        expect(screen.getByText('Call started')).toBeInTheDocument();
        expect(screen.queryByText(/by First1 Last1/)).not.toBeInTheDocument();
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

    test('a declined call, seen by the caller who is told who declined it', () => {
        renderCard(stubPost({start_at: 1000, end_at: 1000 + (5 * 60 * 1000), call_status: CallPostStatus.Declined}));

        expect(screen.getByText('Call ended')).toBeInTheDocument();
        expect(screen.getByText('Declined by First2 Last2')).toBeInTheDocument();
        expect(screen.queryByText(/Lasted/)).not.toBeInTheDocument();
    });

    test('a declined call, seen by the callee who declined it', () => {
        renderCard(
            stubPost({start_at: 1000, end_at: 1000 + (5 * 60 * 1000), call_status: CallPostStatus.Declined}),
            {isCaller: false},
        );

        expect(screen.getByText('Call ended')).toBeInTheDocument();
        expect(screen.getByText('You declined the call')).toBeInTheDocument();
    });

    test('a call that ended normally reports its duration', () => {
        renderCard(stubPost({start_at: 1000, end_at: 1000 + (22 * 60 * 1000), call_status: CallPostStatus.Ended}));

        expect(screen.getByText('Call ended')).toBeInTheDocument();
        expect(screen.getByText(/Ended at/)).toBeInTheDocument();
        expect(screen.getByText('Lasted 22 minutes')).toBeInTheDocument();
    });

    test('a canceled call falls back to naming nobody when the caller\'s profile has not loaded', () => {
        renderCard(
            stubPost({start_at: 1000, end_at: 5000, call_status: CallPostStatus.CanceledByCaller}),
            {isCaller: false, knownProfiles: [callee]},
        );

        expect(screen.getByText('Canceled')).toBeInTheDocument();
        expect(screen.queryByText(/Canceled by/)).not.toBeInTheDocument();
    });

    test('a declined call falls back to naming nobody when the callee\'s profile has not loaded', () => {
        renderCard(
            stubPost({start_at: 1000, end_at: 5000, call_status: CallPostStatus.Declined}),
            {knownProfiles: [caller]},
        );

        expect(screen.getByText('Declined')).toBeInTheDocument();
        expect(screen.queryByText(/Declined by/)).not.toBeInTheDocument();
    });

    test('a call shows its title in place of the compact spacer', () => {
        renderCard(stubPost({start_at: Date.now(), title: 'Standup'}), {connected: true, channelType: 'O'});

        expect(screen.getByRole('heading', {name: 'Standup'})).toBeInTheDocument();
    });

    test('a call in the center channel breaks the line for compact message display', () => {
        const {container} = renderCard(stubPost({start_at: Date.now()}), {compactDisplay: true, channelType: 'O'});

        expect(container.querySelector('br')).toBeInTheDocument();
    });

    test('a call in the RHS does not break the line, compact display or not', () => {
        const {container} = renderCard(stubPost({start_at: Date.now()}), {compactDisplay: true, channelType: 'O'}, true);

        expect(container.querySelector('br')).not.toBeInTheDocument();
    });

    test('a full call offers a disabled join button explaining the participant limit', () => {
        renderCard(
            stubPost({start_at: Date.now()}),
            {sessionUserIDs: [callerID, calleeID], channelType: 'O', maxCallParticipants: 2},
        );

        fireEvent.mouseOver(screen.getByRole('button', {name: 'Join call'}));

        expect(screen.getByText('Sorry, participants per call are currently limited to 2.')).toBeInTheDocument();
    });

    describe('hanging up', () => {
        const callsClient = {disconnect: jest.fn()};

        afterEach(() => {
            window.callsClient = undefined;
            window.desktopAPI = undefined;
        });

        test('should disconnect the calls client', () => {
            window.callsClient = callsClient as never;
            renderCard(stubPost({start_at: Date.now(), call_status: CallPostStatus.Calling}), {connected: true});

            fireEvent.click(screen.getByRole('button', {name: 'Cancel call'}));

            expect(callsClient.disconnect).toHaveBeenCalled();
        });

        // In the desktop app the client lives in the global widget's window, not this one, so the
        // card has to ask the desktop to hang up on its behalf.
        test('should ask the desktop app to leave when this window has no calls client', () => {
            const leaveCall = jest.fn();
            window.desktopAPI = {leaveCall} as never;
            renderCard(stubPost({start_at: Date.now(), call_status: CallPostStatus.Calling}), {connected: true});

            fireEvent.click(screen.getByRole('button', {name: 'Cancel call'}));

            expect(leaveCall).toHaveBeenCalled();
        });

        test('should do nothing when there is nothing to hang up with', () => {
            renderCard(stubPost({start_at: Date.now(), call_status: CallPostStatus.Calling}), {connected: true});

            fireEvent.click(screen.getByRole('button', {name: 'Cancel call'}));

            expect(callsClient.disconnect).not.toHaveBeenCalled();
        });
    });
});
