// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {render} from '@testing-library/react';
import React from 'react';
import type {ScreenShareTrack} from 'src/clients/call/types';

import ScreenSharePlayer from './screen_share_player';

function makeTrack() {
    return {attach: jest.fn(), detach: jest.fn()};
}

const asTrack = (track: ReturnType<typeof makeTrack>) => track as unknown as ScreenShareTrack;

describe('ScreenSharePlayer', () => {
    test('attaches the track to the screen player when mounted', () => {
        const track = makeTrack();
        const {container} = render(<ScreenSharePlayer track={asTrack(track)}/>);

        const video = container.querySelector('#screen-player');
        expect(video).toBeInstanceOf(HTMLVideoElement);
        expect(track.attach).toHaveBeenCalledTimes(1);
        expect(track.attach).toHaveBeenCalledWith(video);
    });

    test('renders an empty player until a track arrives', () => {
        const track = makeTrack();
        const {container, rerender} = render(<ScreenSharePlayer track={null}/>);

        const video = container.querySelector('#screen-player');
        expect(video).toBeInTheDocument();

        rerender(<ScreenSharePlayer track={asTrack(track)}/>);

        expect(track.attach).toHaveBeenCalledTimes(1);
        expect(track.attach).toHaveBeenCalledWith(video);
    });

    test('detaches the old track before attaching the new one when the track changes', () => {
        const first = makeTrack();
        const second = makeTrack();
        const {container, rerender} = render(<ScreenSharePlayer track={asTrack(first)}/>);
        const video = container.querySelector('#screen-player');

        rerender(<ScreenSharePlayer track={asTrack(second)}/>);

        expect(first.detach).toHaveBeenCalledWith(video);
        expect(second.attach).toHaveBeenCalledWith(video);
        expect(first.detach.mock.invocationCallOrder[0]).toBeLessThan(second.attach.mock.invocationCallOrder[0]);
    });

    test('detaches the track when it goes away', () => {
        const track = makeTrack();
        const {container, rerender} = render(<ScreenSharePlayer track={asTrack(track)}/>);
        const video = container.querySelector('#screen-player');

        rerender(<ScreenSharePlayer track={null}/>);

        expect(track.detach).toHaveBeenCalledWith(video);
    });

    test('detaches the track when unmounted', () => {
        const track = makeTrack();
        const {container, unmount} = render(<ScreenSharePlayer track={asTrack(track)}/>);
        const video = container.querySelector('#screen-player');

        unmount();

        expect(track.detach).toHaveBeenCalledWith(video);
    });

    test('does not attach again when re-rendered with the same track', () => {
        const track = makeTrack();
        const {rerender} = render(
            <ScreenSharePlayer
                track={asTrack(track)}
                width='100%'
            />,
        );

        rerender(
            <ScreenSharePlayer
                track={asTrack(track)}
                width='50%'
            />,
        );

        expect(track.attach).toHaveBeenCalledTimes(1);
        expect(track.detach).not.toHaveBeenCalled();
    });

    test('passes video props through to the player', () => {
        const {container} = render(
            <ScreenSharePlayer
                track={null}
                slot='media'
                muted={true}
            />,
        );

        const video = container.querySelector<HTMLVideoElement>('#screen-player');
        expect(video).toHaveAttribute('slot', 'media');
        expect(video?.muted).toBe(true);
    });
});
