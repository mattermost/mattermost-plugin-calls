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

    describe('in the call window', () => {
        const originalOpener = Object.getOwnPropertyDescriptor(window, 'opener');
        let play: jest.SpyInstance;

        const setOpener = (opener: unknown) => {
            Object.defineProperty(window, 'opener', {value: opener, configurable: true, writable: true});
        };

        beforeEach(() => {
            jest.useFakeTimers();
            play = jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
            setOpener({callsClient: {}});
        });

        afterEach(() => {
            jest.useRealTimers();
            play.mockRestore();
            if (originalOpener) {
                Object.defineProperty(window, 'opener', originalOpener);
            }
        });

        test('plays inline and starts playback once attach() has returned', () => {
            const track = makeTrack();
            const {container} = render(<VideoTrackPlayer track={asTrack(track)}/>);
            const video = getVideo(container);

            expect(video.playsInline).toBe(true);
            expect(play).not.toHaveBeenCalled();

            jest.runOnlyPendingTimers();

            expect(play).toHaveBeenCalledTimes(1);
            expect(play.mock.instances[0]).toBe(video);
        });

        test('ignores a rejected play()', async () => {
            play.mockRejectedValue(new Error('NotAllowedError'));
            render(<VideoTrackPlayer track={asTrack(makeTrack())}/>);

            jest.runOnlyPendingTimers();
            await Promise.resolve();

            expect(play).toHaveBeenCalledTimes(1);
        });

        test('cancels the deferred play when unmounted first', () => {
            const {unmount} = render(<VideoTrackPlayer track={asTrack(makeTrack())}/>);

            unmount();
            jest.runOnlyPendingTimers();

            expect(play).not.toHaveBeenCalled();
        });

        test('leaves playback to attach() outside the call window', () => {
            setOpener(null);
            const {container} = render(<VideoTrackPlayer track={asTrack(makeTrack())}/>);

            jest.runOnlyPendingTimers();

            expect(getVideo(container).playsInline).toBe(false);
            expect(play).not.toHaveBeenCalled();
        });
    });
});
