// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {fireEvent, render} from '@testing-library/react';
import type {VideoTrack} from 'livekit-client';
import React from 'react';

import VideoTrackPlayer from './video_track_player';

function makeTrack() {
    return {attach: jest.fn(), detach: jest.fn()};
}

const asTrack = (track: ReturnType<typeof makeTrack>) => track as unknown as VideoTrack;

const getVideo = (container: HTMLElement) => container.querySelector('video') as HTMLVideoElement;

describe('VideoTrackPlayer', () => {
    test('attaches the track to its video element when mounted', () => {
        const track = makeTrack();
        const {container} = render(<VideoTrackPlayer track={asTrack(track)}/>);

        expect(track.attach).toHaveBeenCalledTimes(1);
        expect(track.attach).toHaveBeenCalledWith(getVideo(container));
    });

    test('renders an empty video element until a track arrives', () => {
        const track = makeTrack();
        const {container, rerender} = render(<VideoTrackPlayer track={null}/>);
        const video = getVideo(container);
        expect(video).toBeInTheDocument();

        rerender(<VideoTrackPlayer track={asTrack(track)}/>);

        expect(track.attach).toHaveBeenCalledWith(video);
    });

    test('detaches the old track before attaching the new one when the track changes', () => {
        const first = makeTrack();
        const second = makeTrack();
        const {container, rerender} = render(<VideoTrackPlayer track={asTrack(first)}/>);
        const video = getVideo(container);

        rerender(<VideoTrackPlayer track={asTrack(second)}/>);

        expect(first.detach).toHaveBeenCalledWith(video);
        expect(second.attach).toHaveBeenCalledWith(video);
        expect(first.detach.mock.invocationCallOrder[0]).toBeLessThan(second.attach.mock.invocationCallOrder[0]);
    });

    test('detaches the track when it goes away', () => {
        const track = makeTrack();
        const {container, rerender} = render(<VideoTrackPlayer track={asTrack(track)}/>);
        const video = getVideo(container);

        rerender(<VideoTrackPlayer track={null}/>);

        expect(track.detach).toHaveBeenCalledWith(video);
    });

    test('detaches the track when unmounted', () => {
        const track = makeTrack();
        const {container, unmount} = render(<VideoTrackPlayer track={asTrack(track)}/>);
        const video = getVideo(container);

        unmount();

        expect(track.detach).toHaveBeenCalledWith(video);
    });

    test('does not attach again when re-rendered with the same track', () => {
        const track = makeTrack();
        const onPlaying = jest.fn();
        const {rerender} = render(
            <VideoTrackPlayer
                track={asTrack(track)}
                onPlaying={onPlaying}
            />,
        );

        rerender(
            <VideoTrackPlayer
                track={asTrack(track)}
                onPlaying={jest.fn()}
            />,
        );

        expect(track.attach).toHaveBeenCalledTimes(1);
        expect(track.detach).not.toHaveBeenCalled();
    });

    test.each(['playing', 'loadedData'] as const)('calls onPlaying on the %s event', (event) => {
        const onPlaying = jest.fn();
        const {container} = render(
            <VideoTrackPlayer
                track={asTrack(makeTrack())}
                onPlaying={onPlaying}
            />,
        );

        fireEvent[event](getVideo(container));

        expect(onPlaying).toHaveBeenCalledTimes(1);
    });

    test('calls the latest onPlaying after a re-render', () => {
        const track = makeTrack();
        const first = jest.fn();
        const second = jest.fn();
        const {container, rerender} = render(
            <VideoTrackPlayer
                track={asTrack(track)}
                onPlaying={first}
            />,
        );
        rerender(
            <VideoTrackPlayer
                track={asTrack(track)}
                onPlaying={second}
            />,
        );

        fireEvent.playing(getVideo(container));

        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);
    });

    test('stops calling onPlaying once the track is gone', () => {
        const onPlaying = jest.fn();
        const {container, rerender} = render(
            <VideoTrackPlayer
                track={asTrack(makeTrack())}
                onPlaying={onPlaying}
            />,
        );
        rerender(
            <VideoTrackPlayer
                track={null}
                onPlaying={onPlaying}
            />,
        );

        fireEvent.playing(getVideo(container));

        expect(onPlaying).not.toHaveBeenCalled();
    });

    test('passes video props through to the element', () => {
        const {container} = render(
            <VideoTrackPlayer
                track={null}
                className='preview'
                muted={true}
            />,
        );

        const video = getVideo(container);
        expect(video).toHaveClass('preview');
        expect(video.muted).toBe(true);
    });
});
