// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {act, render, screen, within} from '@testing-library/react';
import type {VideoTrack} from 'livekit-client';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import type {ScreenSharingSession} from 'src/clients/call/types';
import {useDMCallingState} from 'src/components/use_dm_calling_state';
import {FakeCallClient, installFakeCallClient} from 'src/test_utils/fake_call_client';
import {mockStore} from 'src/testUtils';

import DMVideoStage from './dm_video_stage';

jest.mock('src/components/video_tile', () => ({
    __esModule: true,
    default: ({sessionID, size, isSelf}: {sessionID: string; size: string; isSelf?: boolean}) => (
        <div
            data-testid='video-tile'
            data-session-id={sessionID}
            data-size={size}
            data-is-self={String(Boolean(isSelf))}
        />
    ),
}));

jest.mock('./self_view/self_view', () => ({
    __esModule: true,
    default: ({sessionID}: {sessionID: string}) => (
        <div
            data-testid='self-view'
            data-session-id={sessionID}
        />
    ),
}));

jest.mock('./participant_tile_loading', () => ({
    ParticipantTileLoading: ({userID}: {userID?: string}) => (
        <li
            data-testid='ringing-tile'
            data-user-id={userID}
        />
    ),
}));

jest.mock('src/components/use_dm_calling_state', () => ({
    useDMCallingState: jest.fn(),
}));

const mockedDMCallingState = useDMCallingState as jest.MockedFunction<typeof useDMCallingState>;

const makeTrack = () => ({attach: jest.fn(), detach: jest.fn()}) as unknown as VideoTrack;

const remoteShare = (): ScreenSharingSession => ({sessionID: 'other-session', userID: 'other-user', isLocal: false, track: makeTrack()});

// The fake client's own session is 'session-id'.
const ownShare = (): ScreenSharingSession => ({sessionID: 'session-id', userID: 'self-user', isLocal: true, track: makeTrack()});

describe('DMVideoStage', () => {
    let client: FakeCallClient;

    const renderStage = (otherSessionID?: string) => render(
        <Provider
            store={mockStore({
                entities: {users: {profiles: {'other-user': {id: 'other-user', username: 'alice'}}}},
                'plugins-com.mattermost.calls': {
                    sessions: {'channel-id': {'other-session': {session_id: 'other-session', user_id: 'other-user'}}},
                },
            })}
        >
            <IntlProvider locale='en'>
                <DMVideoStage
                    selfSessionID='self-session'
                    otherSessionID={otherSessionID}
                />
            </IntlProvider>
        </Provider>,
    );

    const tiles = () => screen.queryAllByTestId('video-tile').map((tile) => ({
        sessionID: tile.dataset.sessionId,
        size: tile.dataset.size,
        isSelf: tile.dataset.isSelf,
    }));

    beforeEach(() => {
        client = installFakeCallClient();
        mockedDMCallingState.mockReturnValue({isDM: true, isDMCalling: false});
    });

    afterEach(() => {
        window.callsClient = undefined;
    });

    test('fills the stage with the other person and puts us in the self view', () => {
        renderStage('other-session');

        expect(screen.getByRole('region', {name: 'Call stage'})).toBeInTheDocument();
        expect(tiles()).toEqual([{sessionID: 'other-session', size: 'stage', isSelf: 'false'}]);
        expect(screen.getByTestId('self-view')).toHaveAttribute('data-session-id', 'self-session');
    });

    test('keeps the placeholder for the other person while ringing, with our own view', () => {
        mockedDMCallingState.mockReturnValue({isDM: true, isDMCalling: true, dmCalleeID: 'other-user'});

        renderStage();

        expect(screen.getByTestId('ringing-tile')).toHaveAttribute('data-user-id', 'other-user');
        expect(tiles()).toEqual([]);
        expect(screen.getByTestId('self-view')).toBeInTheDocument();
    });

    test('shows a remote share with a filmstrip of both people', () => {
        client.setScreenShare(remoteShare());

        renderStage('other-session');

        expect(screen.getByRole('region', {name: 'alice is presenting'})).toBeInTheDocument();
        const filmstrip = screen.getByRole('list', {name: 'People in the call'});
        expect(within(filmstrip).getAllByTestId('video-tile').map((tile) => tile.dataset.sessionId)).toEqual(['other-session', 'self-session']);
        expect(tiles().every((tile) => tile.size === 'small')).toBe(true);
        expect(screen.queryByTestId('self-view')).not.toBeInTheDocument();
    });

    test('labels our own share', () => {
        client.setScreenShare(ownShare());

        renderStage('other-session');

        expect(screen.getByTestId('calls-dm-video-stage-presenting')).toHaveTextContent('You are presenting');
    });

    test('goes back to cameras when the share ends', () => {
        client.setScreenShare(remoteShare());
        renderStage('other-session');

        act(() => {
            client.setScreenShare(null);
        });

        expect(screen.queryByRole('list', {name: 'People in the call'})).not.toBeInTheDocument();
        expect(tiles()).toEqual([{sessionID: 'other-session', size: 'stage', isSelf: 'false'}]);
    });
});
