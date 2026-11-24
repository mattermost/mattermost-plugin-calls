// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {act, fireEvent, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {VideoTrack} from 'livekit-client';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import type {ScreenSharingSession} from 'src/clients/call/types';
import {FakeCallClient, installFakeCallClient} from 'src/test_utils/fake_call_client';
import {mockStore} from 'src/testUtils';

import MediaArea from './media_area';

jest.mock('src/components/video_tile', () => ({
    __esModule: true,
    default: ({sessionID, size, isSelf, hideMuteState, className}: {sessionID: string; size: string; isSelf?: boolean; hideMuteState?: boolean; className?: string}) => (
        <div
            data-testid='video-tile'
            className={className}
            data-session-id={sessionID}
            data-size={size}
            data-is-self={String(Boolean(isSelf))}
            data-hide-mute-state={String(Boolean(hideMuteState))}
        />
    ),
}));

const tiles = () => screen.queryAllByTestId('video-tile').map((tile) => ({
    sessionID: tile.dataset.sessionId,
    size: tile.dataset.size,
    isSelf: tile.dataset.isSelf,
    hideMuteState: tile.dataset.hideMuteState,
}));

const makeTrack = (displaySurface?: string) => ({
    attach: jest.fn(),
    detach: jest.fn(),
    mediaStreamTrack: {getSettings: () => ({displaySurface})},
}) as unknown as VideoTrack;
const remoteShare = (): ScreenSharingSession => ({sessionID: 'other-session', userID: 'other-user', isLocal: false, track: makeTrack()});
const ownShare = (displaySurface?: string): ScreenSharingSession => ({sessionID: 'self-session', userID: 'self-user', isLocal: true, track: makeTrack(displaySurface)});

type Props = React.ComponentProps<typeof MediaArea>;

describe('MediaArea', () => {
    let client: FakeCallClient;

    const area = (props: Partial<Props> = {}) => (
        <Provider store={mockStore({'plugins-com.mattermost.calls': {sessions: {}}})}>
            <IntlProvider locale='en'>
                <MediaArea
                    shareAllowed={true}
                    onStopSharing={jest.fn()}
                    cameras={null}
                    {...props}
                />
            </IntlProvider>
        </Provider>
    );

    const mediaArea = () => screen.queryByTestId('calls-widget-media-area');
    const expander = () => document.querySelector<HTMLElement>('.CallWidgetMediaArea__expander');
    const bothCameras = {otherSessionID: 'other-session', selfSessionID: 'self-session'};

    beforeEach(() => {
        client = installFakeCallClient();
    });

    afterEach(() => {
        window.callsClient = undefined;
        jest.useRealTimers();
    });

    test('renders nothing without a share or cameras', () => {
        render(area());

        expect(mediaArea()).not.toBeInTheDocument();
    });

    test('renders the other person large and the self-view small without a mute state', () => {
        render(area({cameras: {otherSessionID: 'other-session', selfSessionID: 'self-session'}}));

        expect(tiles()).toEqual([
            {sessionID: 'other-session', size: 'large', isSelf: 'false', hideMuteState: 'false'},
            {sessionID: 'self-session', size: 'small', isSelf: 'true', hideMuteState: 'true'},
        ]);
    });

    test('renders the self-view large when nobody else is in the call yet', () => {
        render(area({cameras: {selfSessionID: 'self-session'}}));

        expect(tiles()).toEqual([{sessionID: 'self-session', size: 'large', isSelf: 'true', hideMuteState: 'true'}]);
    });

    test('keeps the same self-view element when the other person joins, so it can animate to the corner', () => {
        const {rerender} = render(area({cameras: {selfSessionID: 'self-session'}}));
        const selfView = screen.getByTestId('video-tile');
        expect(selfView).toHaveClass('CallWidgetMediaArea__selfView', 'CallWidgetMediaArea__selfView--alone');

        rerender(area({cameras: {otherSessionID: 'other-session', selfSessionID: 'self-session'}}));

        const [remote, self] = screen.getAllByTestId('video-tile');
        expect(self).toBe(selfView);
        expect(self).not.toHaveClass('CallWidgetMediaArea__selfView--alone');
        expect(remote).toHaveClass('CallWidgetMediaArea__remote');
    });

    test('a share wins over cameras inside the same expander', () => {
        render(area({cameras: bothCameras}));
        const cameraExpander = expander();

        act(() => client.setScreenShare(remoteShare()));

        expect(tiles()).toEqual([]);
        expect(document.querySelector('#screen-player')).toBeInTheDocument();
        expect(expander()).toBe(cameraExpander);
    });

    test('ignores a share when sharing is not allowed', () => {
        client.screenSharingSessionID = 'other-session';
        render(area({shareAllowed: false, cameras: {selfSessionID: 'self-session'}}));

        expect(document.querySelector('#screen-player')).not.toBeInTheDocument();
        expect(tiles()).toHaveLength(1);
    });

    test('labels someone else\'s share with the presenting bar, without Stop', () => {
        render(area({presenterName: 'Sharer'}));
        act(() => client.setScreenShare(remoteShare()));

        const bar = screen.getByText('Sharer is presenting').closest('.CallWidgetMediaArea__presenting');
        expect(bar).toBeInTheDocument();
        expect(bar?.querySelector('.CallWidgetMediaArea__liveDot')).not.toBeInTheDocument();
        expect(screen.getByRole('group', {name: 'Sharer is presenting'})).toContainElement(document.querySelector('#screen-player') as HTMLElement);
        expect(screen.queryByText('You are presenting')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', {name: 'Stop'})).not.toBeInTheDocument();
    });

    test('shows no bar or label until the presenter\'s name is known', () => {
        render(area({presenterName: undefined}));
        act(() => client.setScreenShare(remoteShare()));

        expect(document.querySelector('#screen-player')).toBeInTheDocument();
        expect(document.querySelector('.CallWidgetMediaArea__presenting')).not.toBeInTheDocument();
        expect(screen.getByRole('group')).not.toHaveAttribute('aria-labelledby');
    });

    test('shows your own share with a presenting bar whose Stop button stops sharing', async () => {
        const onStopSharing = jest.fn();
        render(area({onStopSharing, presenterName: 'Me'}));
        act(() => client.setScreenShare(ownShare()));

        expect(screen.getByRole('group', {name: 'You are presenting'})).toBeInTheDocument();
        const bar = screen.getByText('You are presenting').closest('.CallWidgetMediaArea__presenting');
        expect(bar).toContainElement(screen.getByTestId('calls-widget-stop-screenshare'));
        expect(bar?.querySelector('.CallWidgetMediaArea__liveDot')).toBeInTheDocument();
        expect(screen.queryByText(/is presenting/)).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', {name: 'Stop'}));

        expect(onStopSharing).toHaveBeenCalledTimes(1);
    });

    test.each([
        ['monitor', 'You are presenting your entire screen'],
        ['window', 'You are presenting a window'],
        ['browser', 'You are presenting a tab'],
        [undefined, 'You are presenting'],
        ['application', 'You are presenting'],
    ])('says what you are presenting for the %s surface, in the bar and the area label', (displaySurface, text) => {
        render(area());
        act(() => client.setScreenShare(ownShare(displaySurface)));

        expect(screen.getByText(text)).toHaveClass('CallWidgetMediaArea__overlayText');
        expect(screen.getByRole('group', {name: text})).toBeInTheDocument();
    });

    test('opens expanded once it has laid out', () => {
        render(area({cameras: bothCameras}));

        expect(expander()).not.toHaveClass('CallWidgetMediaArea__expander--collapsed');
        expect(expander()).toHaveAttribute('aria-hidden', 'false');
    });

    test('keeps the last cameras while it collapses, and unmounts when the collapse ends', () => {
        const {rerender} = render(area({cameras: bothCameras}));
        const [remote, self] = screen.getAllByTestId('video-tile');

        rerender(area({cameras: null}));

        expect(expander()).toHaveClass('CallWidgetMediaArea__expander--collapsed');
        expect(expander()).toHaveAttribute('aria-hidden', 'true');
        expect(screen.getAllByTestId('video-tile')).toEqual([remote, self]);

        fireEvent.transitionEnd(self);
        expect(mediaArea()).toBeInTheDocument();

        fireEvent.transitionEnd(expander()!);
        expect(mediaArea()).not.toBeInTheDocument();
    });

    test('keeps the last share and its presenting bar while it collapses', () => {
        const {rerender} = render(area({presenterName: 'Sharer'}));
        act(() => client.setScreenShare(remoteShare()));
        const player = document.querySelector('#screen-player');

        act(() => client.setScreenShare(null));
        rerender(area({presenterName: undefined}));

        expect(expander()).toHaveClass('CallWidgetMediaArea__expander--collapsed');
        expect(document.querySelector('#screen-player')).toBe(player);
        expect(screen.getByText('Sharer is presenting')).toBeInTheDocument();
    });

    test('unmounts after a fallback delay when the collapse never reports its end', () => {
        jest.useFakeTimers();
        const {rerender} = render(area({cameras: bothCameras}));

        rerender(area({cameras: null}));
        act(() => jest.advanceTimersByTime(300));
        expect(mediaArea()).toBeInTheDocument();

        act(() => jest.advanceTimersByTime(200));
        expect(mediaArea()).not.toBeInTheDocument();
    });

    test('reopening mid-collapse grows back with the same elements and stays mounted', () => {
        jest.useFakeTimers();
        const {rerender} = render(area({cameras: bothCameras}));
        const openArea = mediaArea();
        const [remote, self] = screen.getAllByTestId('video-tile');

        rerender(area({cameras: null}));
        act(() => jest.advanceTimersByTime(150));
        rerender(area({cameras: bothCameras}));

        expect(expander()).not.toHaveClass('CallWidgetMediaArea__expander--collapsed');
        fireEvent.transitionEnd(expander()!);
        act(() => jest.advanceTimersByTime(1000));

        expect(mediaArea()).toBe(openArea);
        expect(screen.getAllByTestId('video-tile')).toEqual([remote, self]);
    });

    test('reopening mid-collapse with a share swaps the content inside the same area', () => {
        const {rerender} = render(area({cameras: bothCameras}));
        const openArea = mediaArea();

        rerender(area({cameras: null}));
        act(() => client.setScreenShare(remoteShare()));

        expect(mediaArea()).toBe(openArea);
        expect(expander()).not.toHaveClass('CallWidgetMediaArea__expander--collapsed');
        expect(document.querySelector('#screen-player')).toBeInTheDocument();
    });

    test('clears the fallback timer when it unmounts mid-collapse', () => {
        jest.useFakeTimers();
        const {rerender, unmount} = render(area({cameras: bothCameras}));
        rerender(area({cameras: null}));
        expect(jest.getTimerCount()).toBe(1);

        unmount();

        expect(jest.getTimerCount()).toBe(0);
    });

    test('closes at once when reduced motion is preferred', () => {
        const matchMedia = window.matchMedia;
        window.matchMedia = jest.fn((query: string) => ({matches: query === '(prefers-reduced-motion: reduce)'})) as unknown as typeof window.matchMedia;
        try {
            const {rerender} = render(area({cameras: bothCameras}));

            rerender(area({cameras: null}));

            expect(mediaArea()).not.toBeInTheDocument();
        } finally {
            window.matchMedia = matchMedia;
        }
    });
});
