// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Reaction, UserSessionState} from '@mattermost/calls-common/lib/types';
import {UserProfile} from '@mattermost/types/users';
import {fireEvent, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {VideoTrack} from 'livekit-client';
import React from 'react';
import {createIntl, RawIntlProvider} from 'react-intl';
import {CameraState} from 'src/clients/call/types';
import type {ConnectionState} from 'src/state/connection_quality/reducer';

import VideoTile, {Props, VideoTileState} from './video_tile';

const intl = createIntl({locale: 'en', messages: {}});

const makeTrack = () => ({attach: jest.fn(), detach: jest.fn()}) as unknown as VideoTrack;

const session: UserSessionState = {
    session_id: 'session-1',
    user_id: 'user-1',
    unmuted: false,
    raised_hand: 0,
};

const profile = {
    id: 'user-1',
    username: 'marco',
    first_name: 'Marco',
    last_name: 'Rinaldi',
    last_picture_update: 0,
} as UserProfile;

const reaction: Reaction = {
    user_id: 'user-1',
    session_id: 'session-1',
    timestamp: 1,
    displayName: 'Marco Rinaldi',
    emoji: {name: 'smile', unified: '1F604'},
};

const renderTile = (props: Partial<Props> = {}) => {
    const allProps: Props = {
        session,
        profile,
        track: null,
        cameraState: CameraState.Off,
        connectionState: 'good',
        size: 'large',
        ...props,
    };
    const result = render(
        <RawIntlProvider value={intl}>
            <VideoTile {...allProps}/>
        </RawIntlProvider>,
    );
    return {...result, allProps};
};

const startPlaying = (container: HTMLElement) => {
    const video = container.querySelector('video');
    if (video) {
        fireEvent.playing(video);
    }
};

describe('VideoTile', () => {
    let pause: jest.SpyInstance;
    let play: jest.SpyInstance;

    beforeEach(() => {
        pause = jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
        play = jest.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
    });

    afterEach(() => {
        pause.mockRestore();
        play.mockRestore();
    });

    type StateCase = {
        cameraState: CameraState;
        connectionState: ConnectionState;
        hasTrack: boolean;
        expected: VideoTileState;
        videoVisible: boolean;
        avatar: boolean;
        statusText: string | null;
        poorBadge: boolean;
        paused: boolean;
    };

    test.each<[string, StateCase]>([
        ['video on', {cameraState: CameraState.Ready, connectionState: 'good', hasTrack: true, expected: 'video', videoVisible: true, avatar: false, statusText: null, poorBadge: false, paused: false}],
        ['video off', {cameraState: CameraState.Off, connectionState: 'good', hasTrack: false, expected: 'off', videoVisible: false, avatar: true, statusText: null, poorBadge: false, paused: false}],
        ['loading', {cameraState: CameraState.Loading, connectionState: 'good', hasTrack: false, expected: 'loading', videoVisible: false, avatar: true, statusText: 'Connecting…', poorBadge: false, paused: false}],
        ['poor connection', {cameraState: CameraState.Ready, connectionState: 'poor', hasTrack: true, expected: 'poor', videoVisible: true, avatar: false, statusText: null, poorBadge: true, paused: true}],
        ['reconnecting', {cameraState: CameraState.Ready, connectionState: 'reconnecting', hasTrack: true, expected: 'reconnecting', videoVisible: true, avatar: false, statusText: 'Reconnecting…', poorBadge: false, paused: true}],
    ])('renders the %s state', (_, c) => {
        const {container} = renderTile({
            cameraState: c.cameraState,
            connectionState: c.connectionState,
            track: c.hasTrack ? makeTrack() : null,
        });
        startPlaying(container);

        const tile = screen.getByTestId('video-tile');
        expect(tile).toHaveAttribute('data-state', c.expected);
        expect(Boolean(container.querySelector('.VideoTile__video--visible'))).toBe(c.videoVisible);
        expect(Boolean(container.querySelector('.VideoTile__avatar'))).toBe(c.avatar);
        expect(Boolean(container.querySelector('.VideoTile__spinner'))).toBe(c.statusText !== null);
        if (c.statusText) {
            expect(screen.getByText(c.statusText)).toBeInTheDocument();
        }
        expect(Boolean(screen.queryByTestId('video-tile-poor-connection'))).toBe(c.poorBadge);
        expect(pause).toHaveBeenCalledTimes(c.paused ? 1 : 0);
    });

    test('stays loading with the avatar until the video is actually playing', () => {
        const {container} = renderTile({cameraState: CameraState.Ready, track: makeTrack()});

        expect(screen.getByTestId('video-tile')).toHaveAttribute('data-state', 'loading');
        expect(container.querySelector('.VideoTile__avatar')).toBeInTheDocument();
        expect(container.querySelector('video')).toBeInTheDocument();

        startPlaying(container);

        expect(screen.getByTestId('video-tile')).toHaveAttribute('data-state', 'video');
        expect(container.querySelector('.VideoTile__avatar')).not.toBeInTheDocument();
    });

    test('shows the poor connection badge on a tile with the camera off', () => {
        renderTile({connectionState: 'poor'});

        expect(screen.getByTestId('video-tile')).toHaveAttribute('data-state', 'off');
        expect(screen.getByTestId('video-tile-poor-connection')).toBeInTheDocument();
    });

    test('shows a "Poor connection" tooltip on the warning badge', async () => {
        renderTile({connectionState: 'poor'});

        await userEvent.hover(screen.getByTestId('video-tile-poor-connection'));

        expect(await screen.findByText('Poor connection')).toBeInTheDocument();
    });

    test('resumes the paused video once the connection recovers', () => {
        const track = makeTrack();
        const {container, rerender, allProps} = renderTile({cameraState: CameraState.Ready, track, connectionState: 'poor'});
        startPlaying(container);
        expect(pause).toHaveBeenCalledTimes(1);

        rerender(
            <RawIntlProvider value={intl}>
                <VideoTile
                    {...allProps}
                    connectionState='good'
                />
            </RawIntlProvider>,
        );

        expect(play).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('video-tile')).toHaveAttribute('data-state', 'video');
    });

    test.each<[ConnectionState | 'loading', string]>([
        ['loading', 'loading'],
        ['reconnecting', 'reconnecting'],
    ])('a small %s tile shows only the spinner', (state, expected) => {
        const {container} = renderTile({
            size: 'small',
            cameraState: state === 'loading' ? CameraState.Loading : CameraState.Off,
            connectionState: state === 'loading' ? 'good' : state,
        });

        expect(screen.getByTestId('video-tile')).toHaveAttribute('data-state', expected);
        expect(container.querySelector('.VideoTile__spinner')).toBeInTheDocument();
        expect(container.querySelector('.VideoTile__statusText')).not.toBeInTheDocument();
    });

    test.each<[string, Partial<Props>, string]>([
        ['camera off and muted', {}, 'Marco Rinaldi: camera off, muted'],
        ['camera on and unmuted', {cameraState: CameraState.Ready, track: makeTrack(), session: {...session, unmuted: true}}, 'Marco Rinaldi: camera on, unmuted'],
        ['camera connecting', {cameraState: CameraState.Loading}, 'Marco Rinaldi: camera connecting, muted'],
        ['poor connection with a raised hand', {connectionState: 'poor', session: {...session, raised_hand: 1000}}, 'Marco Rinaldi: camera off, poor connection, muted, hand raised'],
        ['reconnecting', {connectionState: 'reconnecting'}, 'Marco Rinaldi: camera off, reconnecting, muted'],
        ['the self-view, which hides the mute state', {isSelf: true, hideMuteState: true}, 'Marco Rinaldi (you): camera off'],
    ])('labels a tile with %s', (_, props, expected) => {
        const {container} = renderTile(props);
        startPlaying(container);

        expect(screen.getByRole('img', {name: expected})).toBeInTheDocument();
    });

    test('shows the name with the mute state', () => {
        renderTile();

        expect(screen.getByText('Marco Rinaldi')).toBeInTheDocument();
        expect(screen.getByTestId('video-tile-muted')).toBeInTheDocument();
    });

    test('hides the mute state for the self-view', () => {
        renderTile({isSelf: true, hideMuteState: true});

        expect(screen.getByText('Marco Rinaldi (you)')).toBeInTheDocument();
        expect(screen.queryByTestId('video-tile-muted')).not.toBeInTheDocument();
        expect(screen.queryByTestId('video-tile-unmuted')).not.toBeInTheDocument();
    });

    test.each([
        ['on', CameraState.Ready],
        ['off', CameraState.Off],
    ])('shows the speaking border and sound wave with the camera %s', (_, cameraState) => {
        renderTile({cameraState, track: cameraState === CameraState.Ready ? makeTrack() : null, session: {...session, unmuted: true, voice: true}});

        expect(screen.getByTestId('video-tile')).toHaveClass('VideoTile--speaking');
        expect(screen.getByTestId('video-tile-speaking')).toBeInTheDocument();
    });

    test('does not show the speaking state when silent', () => {
        renderTile();

        expect(screen.getByTestId('video-tile')).not.toHaveClass('VideoTile--speaking');
        expect(screen.queryByTestId('video-tile-speaking')).not.toBeInTheDocument();
    });

    test('shows a raised hand badge over a reaction', () => {
        const {container} = renderTile({session: {...session, raised_hand: 1000, reaction}});

        expect(container.querySelector('.VideoTile__badge--hand')).toBeInTheDocument();
        expect(screen.queryByText('smile')).not.toBeInTheDocument();
    });

    test('shows a reaction badge', () => {
        renderTile({session: {...session, reaction}});

        expect(screen.getByText('smile')).toBeInTheDocument();
    });

    test.each([true, false])('mirrors the video when isMirrored is %s', (isMirrored) => {
        const {container} = renderTile({cameraState: CameraState.Ready, track: makeTrack(), isMirrored});

        expect(Boolean(container.querySelector('.VideoTile__video--mirrored'))).toBe(isMirrored);
    });

    test('attaches the camera track to the video element', () => {
        const track = makeTrack();
        const {container} = renderTile({cameraState: CameraState.Ready, track});

        expect(track.attach).toHaveBeenCalledWith(container.querySelector('video'));
    });
});
