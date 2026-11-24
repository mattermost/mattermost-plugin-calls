// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {act, fireEvent, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {IntlProvider} from 'react-intl';
import {CurrentCallData, CurrentCallDataDefault} from 'src/types/types';

import SelfView from './self_view';

jest.mock('src/components/video_tile', () => ({
    __esModule: true,
    default: ({sessionID, isSelf}: {sessionID: string; isSelf?: boolean}) => (
        <div
            data-testid='video-tile'
            data-session-id={sessionID}
            data-is-self={String(Boolean(isSelf))}
        />
    ),
}));

const renderSelfView = () => render(
    <IntlProvider locale='en'>
        <SelfView sessionID='self-session'/>
    </IntlProvider>,
);

const callData = () => window.currentCallData as CurrentCallData;
const tile = () => screen.getByTestId('calls-self-view-tile');
const announcer = () => screen.getByRole('status');

describe('SelfView', () => {
    beforeEach(() => {
        window.currentCallData = {...CurrentCallDataDefault};
    });

    test('shows our own tile in the bottom right corner by default', () => {
        renderSelfView();

        expect(tile()).toHaveAttribute('data-corner', 'bottom-right');
        expect(screen.getByTestId('video-tile')).toHaveAttribute('data-is-self', 'true');
        expect(tile()).toHaveAccessibleName('Self view, bottom right. Drag or use the arrow keys to move it.');
    });

    test('starts in the corner saved for the call', () => {
        callData().selfView = {corner: 'top-left', hidden: false};

        renderSelfView();

        expect(tile()).toHaveAttribute('data-corner', 'top-left');
    });

    test('moves between corners with the arrow keys and announces it', () => {
        renderSelfView();

        fireEvent.keyDown(tile(), {key: 'ArrowLeft'});
        expect(tile()).toHaveAttribute('data-corner', 'bottom-left');
        expect(announcer()).toHaveTextContent('Self view moved to bottom left');

        fireEvent.keyDown(tile(), {key: 'ArrowUp'});
        expect(tile()).toHaveAttribute('data-corner', 'top-left');
        expect(announcer()).toHaveTextContent('Self view moved to top left');
        expect(callData().selfView?.corner).toBe('top-left');
    });

    test('ignores an arrow key that points off the stage', () => {
        renderSelfView();

        fireEvent.keyDown(tile(), {key: 'ArrowRight'});

        expect(tile()).toHaveAttribute('data-corner', 'bottom-right');
        expect(announcer()).toBeEmptyDOMElement();
    });

    test('moves to a corner from the Move self view submenu', async () => {
        const user = userEvent.setup();
        renderSelfView();

        await user.click(screen.getByRole('button', {name: 'Self view options'}));
        await user.click(screen.getByRole('menuitem', {name: 'Move self view'}));
        await user.click(screen.getByRole('menuitemradio', {name: 'Top right'}));

        expect(tile()).toHaveAttribute('data-corner', 'top-right');
        expect(announcer()).toHaveTextContent('Self view moved to top right');
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    test('opens the submenu with the right arrow and closes it with the left arrow', async () => {
        const user = userEvent.setup();
        renderSelfView();

        await user.click(screen.getByRole('button', {name: 'Self view options'}));
        expect(screen.getByRole('menuitem', {name: 'Hide self view'})).toHaveFocus();

        await user.keyboard('{ArrowDown}');
        const moveItem = screen.getByRole('menuitem', {name: 'Move self view'});
        expect(moveItem).toHaveFocus();

        await user.keyboard('{ArrowRight}');
        expect(screen.getByRole('menuitemradio', {name: 'Bottom right'})).toHaveFocus();
        expect(moveItem).toHaveAttribute('aria-expanded', 'true');

        await user.keyboard('{ArrowLeft}');
        expect(screen.queryByRole('menuitemradio', {name: 'Bottom right'})).not.toBeInTheDocument();
        expect(moveItem).toHaveFocus();
    });

    test('returns focus to the options button when the menu closes with Escape', async () => {
        const user = userEvent.setup();
        renderSelfView();
        const optionsButton = screen.getByRole('button', {name: 'Self view options'});

        await user.click(optionsButton);
        await user.keyboard('{Escape}');

        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        expect(optionsButton).toHaveFocus();
        expect(optionsButton).toHaveAttribute('aria-expanded', 'false');
    });

    test('hides to a Show self view button and comes back', async () => {
        const user = userEvent.setup();
        renderSelfView();

        await user.click(screen.getByRole('button', {name: 'Self view options'}));
        await user.click(screen.getByRole('menuitem', {name: 'Hide self view'}));

        expect(screen.queryByTestId('calls-self-view-tile')).not.toBeInTheDocument();
        expect(announcer()).toHaveTextContent('Self view hidden');
        expect(callData().selfView?.hidden).toBe(true);

        await user.click(screen.getByRole('button', {name: 'Show self view'}));

        expect(tile()).toBeInTheDocument();
        expect(announcer()).toHaveTextContent('Self view shown');
        expect(callData().selfView?.hidden).toBe(false);
    });

    test('keeps the corner it was in when shown again', async () => {
        const user = userEvent.setup();
        callData().selfView = {corner: 'top-left', hidden: true};
        renderSelfView();

        await user.click(screen.getByRole('button', {name: 'Show self view'}));

        expect(tile()).toHaveAttribute('data-corner', 'top-left');
    });

    describe('options menu keyboard', () => {
        const optionsButton = () => screen.getByRole('button', {name: 'Self view options'});
        const item = (name: string) => screen.getByRole('menuitem', {name});
        const cornerItem = (name: string) => screen.getByRole('menuitemradio', {name});

        test('Home, End and ArrowUp move between items, wrapping at the ends', async () => {
            const user = userEvent.setup();
            renderSelfView();
            await user.click(optionsButton());
            expect(item('Hide self view')).toHaveFocus();

            await user.keyboard('{End}');
            expect(item('Move self view')).toHaveFocus();

            await user.keyboard('{Home}');
            expect(item('Hide self view')).toHaveFocus();

            await user.keyboard('{ArrowUp}');
            expect(item('Move self view')).toHaveFocus();
        });

        test('Tab closes the menu without pulling focus back to the options button', async () => {
            const user = userEvent.setup();
            renderSelfView();
            await user.click(optionsButton());

            await user.keyboard('{Tab}');

            expect(screen.queryByRole('menu')).not.toBeInTheDocument();
            expect(optionsButton()).toHaveAttribute('aria-expanded', 'false');
            expect(optionsButton()).not.toHaveFocus();
        });

        test('a mousedown outside closes the menu, but one inside does not', async () => {
            const user = userEvent.setup();
            renderSelfView();
            await user.click(optionsButton());

            fireEvent.mouseDown(item('Move self view'));
            expect(screen.getByRole('menu')).toBeInTheDocument();

            fireEvent.mouseDown(document.body);
            expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        });

        test('the submenu supports Home, End and arrows, and Escape returns to the Move item', async () => {
            const user = userEvent.setup();
            renderSelfView();
            await user.click(optionsButton());
            await user.click(item('Move self view'));
            expect(cornerItem('Bottom right')).toHaveFocus();

            await user.keyboard('{Home}');
            expect(cornerItem('Top left')).toHaveFocus();
            await user.keyboard('{ArrowDown}');
            expect(cornerItem('Top right')).toHaveFocus();
            await user.keyboard('{End}');
            expect(cornerItem('Bottom right')).toHaveFocus();

            await user.keyboard('{Escape}');

            expect(screen.queryByRole('menuitemradio', {name: 'Bottom right'})).not.toBeInTheDocument();
            expect(item('Move self view')).toHaveFocus();
            expect(tile()).toHaveAttribute('data-corner', 'bottom-right');
        });

        test('Tab in the submenu closes the whole menu', async () => {
            const user = userEvent.setup();
            renderSelfView();
            await user.click(optionsButton());
            await user.click(item('Move self view'));

            await user.keyboard('{Tab}');

            expect(screen.queryByRole('menu')).not.toBeInTheDocument();
            expect(optionsButton()).toHaveAttribute('aria-expanded', 'false');
        });
    });

    describe('dragging', () => {
        const at = (x: number, y: number) => `translate3d(${x}px, ${y}px, 0)`;

        // With the default sizes, the view's corner positions inside the 16px margin.
        const TOP_LEFT = at(16, 16);
        const BOTTOM_RIGHT = at(784, 472);

        const originalResizeObserver = window.ResizeObserver;

        let stage: {width: number; height: number};
        let frames: Map<number, FrameRequestCallback>;
        let nextFrameID: number;
        let now: number;
        let resize: () => void;
        let disconnect: jest.Mock;

        // jsdom has no layout, so the stage and the view get fixed sizes.
        beforeEach(() => {
            // Like the browser's, it reports the stage's size as soon as it starts observing.
            disconnect = jest.fn();
            window.ResizeObserver = class {
                constructor(private callback: () => void) {
                    resize = () => act(callback);
                }
                observe = () => this.callback();
                disconnect = disconnect;
            } as unknown as typeof ResizeObserver;

            stage = {width: 1000, height: 600};
            const sizeOf = (el: HTMLElement, stageSize: number, view: number) => (el.classList.contains('SelfView') ? stageSize : view);
            jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function width(this: HTMLElement) {
                return sizeOf(this, stage.width, 200);
            });
            jest.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function height(this: HTMLElement) {
                return sizeOf(this, stage.height, 112);
            });

            frames = new Map();
            nextFrameID = 0;
            now = 0;
            jest.spyOn(performance, 'now').mockImplementation(() => now);
            jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
                nextFrameID += 1;
                frames.set(nextFrameID, callback);
                return nextFrameID;
            });
            jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
                frames.delete(id);
            });
        });

        afterEach(() => {
            jest.restoreAllMocks();
            window.ResizeObserver = originalResizeObserver;
        });

        const runFrame = () => {
            const [id, callback] = frames.entries().next().value as [number, FrameRequestCallback];
            frames.delete(id);
            now += 16;
            callback(now);
        };

        const runFrames = () => {
            let count = 0;
            while (frames.size > 0 && count < 1000) {
                runFrame();
                count += 1;
            }
            return count;
        };

        const transform = () => tile().style.transform;

        const pointer = (type: 'pointerDown' | 'pointerMove' | 'pointerUp' | 'pointerCancel', clientX: number, clientY: number, timeStamp: number) => {
            const event = new MouseEvent(type.toLowerCase(), {bubbles: true, clientX, clientY, button: 0});
            Object.defineProperties(event, {
                pointerId: {value: 1},
                isPrimary: {value: true},
                timeStamp: {value: timeStamp},
            });
            act(() => {
                tile().dispatchEvent(event);
            });
        };

        test('a drag toward the top left lands there', () => {
            renderSelfView();

            pointer('pointerDown', 900, 500, 1);
            pointer('pointerMove', 600, 300, 50);
            pointer('pointerMove', 100, 50, 100);
            pointer('pointerUp', 100, 50, 110);

            expect(tile()).toHaveAttribute('data-corner', 'top-left');
            expect(announcer()).toHaveTextContent('Self view moved to top left');
        });

        test('Escape cancels a drag and keeps the corner', () => {
            renderSelfView();

            pointer('pointerDown', 900, 500, 1);
            pointer('pointerMove', 100, 50, 50);
            fireEvent.keyDown(window, {key: 'Escape'});
            pointer('pointerUp', 100, 50, 60);

            expect(tile()).toHaveAttribute('data-corner', 'bottom-right');
            expect(announcer()).toBeEmptyDOMElement();
        });

        test('starts in its corner', () => {
            renderSelfView();

            expect(transform()).toBe(BOTTOM_RIGHT);
        });

        test('springs into its new corner after a release', () => {
            renderSelfView();

            pointer('pointerDown', 900, 500, 1);
            pointer('pointerMove', 600, 300, 50);
            pointer('pointerMove', 100, 50, 100);
            pointer('pointerUp', 100, 50, 110);

            // Released where it was dragged to, clamped to the stage.
            expect(transform()).toBe(at(0, 22));

            runFrame();
            expect(transform()).not.toBe(at(0, 22));
            expect(transform()).not.toBe(TOP_LEFT);

            expect(runFrames()).toBeGreaterThan(1);
            expect(transform()).toBe(TOP_LEFT);
            expect(frames.size).toBe(0);
        });

        test('jumps straight to the corner when reduced motion is preferred', () => {
            Object.defineProperty(window, 'matchMedia', {
                configurable: true,
                writable: true,
                value: jest.fn((query: string) => ({matches: query === '(prefers-reduced-motion: reduce)'})),
            });
            try {
                renderSelfView();

                pointer('pointerDown', 900, 500, 1);
                pointer('pointerMove', 100, 50, 50);
                pointer('pointerUp', 100, 50, 60);

                expect(tile()).toHaveAttribute('data-corner', 'top-left');
                expect(transform()).toBe(TOP_LEFT);
                expect(frames.size).toBe(0);
            } finally {
                Reflect.deleteProperty(window, 'matchMedia');
            }
        });

        test('a click without a real move leaves the view where it is', () => {
            renderSelfView();

            pointer('pointerDown', 900, 500, 1);
            pointer('pointerMove', 902, 501, 5);
            expect(transform()).toBe(BOTTOM_RIGHT);
            pointer('pointerUp', 902, 501, 10);
            runFrames();

            expect(tile()).toHaveAttribute('data-corner', 'bottom-right');
            expect(transform()).toBe(BOTTOM_RIGHT);
            expect(announcer()).toBeEmptyDOMElement();
        });

        test.each([
            ['a quick release throws the view toward the drag', 30, 'bottom-left'],
            ['a pause before letting go drops the throw', 400, 'bottom-right'],
        ])('%s', (_, releaseAt, corner) => {
            renderSelfView();

            // Ends right of centre, so only the leftward throw can carry it to the left corner.
            pointer('pointerDown', 900, 500, 1);
            pointer('pointerMove', 800, 500, 10);
            pointer('pointerMove', 700, 500, 20);
            pointer('pointerUp', 700, 500, releaseAt);

            expect(tile()).toHaveAttribute('data-corner', corner);
        });

        test('does not throw the view when the events share a timestamp', () => {
            renderSelfView();

            pointer('pointerDown', 900, 500, 5);
            pointer('pointerMove', 700, 500, 5);
            pointer('pointerUp', 700, 500, 5);

            expect(tile()).toHaveAttribute('data-corner', 'bottom-right');
        });

        test('a cancelled pointer puts the view back in its corner', () => {
            renderSelfView();

            pointer('pointerDown', 900, 500, 1);
            pointer('pointerMove', 100, 50, 50);
            pointer('pointerCancel', 100, 50, 60);
            runFrames();

            expect(tile()).toHaveAttribute('data-corner', 'bottom-right');
            expect(transform()).toBe(BOTTOM_RIGHT);
            expect(announcer()).toBeEmptyDOMElement();

            // The drag is over, so later moves do nothing.
            pointer('pointerMove', 100, 50, 70);
            expect(transform()).toBe(BOTTOM_RIGHT);
        });

        test('captures the pointer during a drag and releases it after', () => {
            const captured = new Set<number>();
            const setPointerCapture = jest.fn((id: number) => captured.add(id));
            const releasePointerCapture = jest.fn((id: number) => captured.delete(id));
            Object.assign(HTMLElement.prototype, {
                setPointerCapture,
                releasePointerCapture,
                hasPointerCapture: (id: number) => captured.has(id),
            });
            try {
                renderSelfView();

                pointer('pointerDown', 900, 500, 1);
                expect(setPointerCapture).toHaveBeenCalledWith(1);

                pointer('pointerMove', 100, 50, 50);
                pointer('pointerUp', 100, 50, 60);
                expect(releasePointerCapture).toHaveBeenCalledWith(1);
                expect(captured.size).toBe(0);
            } finally {
                ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture'].forEach((name) => Reflect.deleteProperty(HTMLElement.prototype, name));
            }
        });

        describe('when the stage resizes', () => {
            test('keeps the view in its corner', () => {
                renderSelfView();

                stage = {width: 800, height: 500};
                resize();

                expect(transform()).toBe(at(584, 372));
            });

            test('leaves the view alone while it is being dragged or animating', () => {
                renderSelfView();

                pointer('pointerDown', 900, 500, 1);
                pointer('pointerMove', 600, 300, 50);
                const dragged = transform();
                resize();
                expect(transform()).toBe(dragged);

                pointer('pointerUp', 600, 300, 60);
                const released = transform();
                resize();
                expect(transform()).toBe(released);
            });

            test('stops observing when unmounted', () => {
                const {unmount} = renderSelfView();

                unmount();

                expect(disconnect).toHaveBeenCalled();
            });
        });
    });
});
