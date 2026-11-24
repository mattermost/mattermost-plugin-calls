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

    describe('dragging', () => {
        // jsdom has no layout, so the stage and the view get fixed sizes.
        beforeEach(() => {
            const sizeOf = (el: HTMLElement, stage: number, view: number) => (el.classList.contains('SelfView') ? stage : view);
            jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function width(this: HTMLElement) {
                return sizeOf(this, 1000, 200);
            });
            jest.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function height(this: HTMLElement) {
                return sizeOf(this, 600, 112);
            });
        });

        afterEach(() => {
            jest.restoreAllMocks();
        });

        const pointer = (type: 'pointerDown' | 'pointerMove' | 'pointerUp', clientX: number, clientY: number, timeStamp: number) => {
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
    });
});
