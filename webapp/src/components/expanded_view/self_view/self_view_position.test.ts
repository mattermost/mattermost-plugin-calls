// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {CurrentCallDataDefault} from 'src/types/types';

import {
    clampPosition,
    cornerForArrowKey,
    cornerPosition,
    nearestCorner,
    projectPosition,
    readSelfViewState,
    SELF_VIEW_MARGIN_PX,
    SELF_VIEW_STATE_DEFAULT,
    springSettled,
    SpringState,
    springStep,
    writeSelfViewState,
} from './self_view_position';

const container = {width: 1000, height: 600};
const tile = {width: 200, height: 112};

describe('cornerPosition', () => {
    test.each([
        ['top-left', {x: SELF_VIEW_MARGIN_PX, y: SELF_VIEW_MARGIN_PX}],
        ['top-right', {x: 1000 - 200 - SELF_VIEW_MARGIN_PX, y: SELF_VIEW_MARGIN_PX}],
        ['bottom-left', {x: SELF_VIEW_MARGIN_PX, y: 600 - 112 - SELF_VIEW_MARGIN_PX}],
        ['bottom-right', {x: 1000 - 200 - SELF_VIEW_MARGIN_PX, y: 600 - 112 - SELF_VIEW_MARGIN_PX}],
    ] as const)('places the view in the %s corner inside the margin', (corner, expected) => {
        expect(cornerPosition(corner, container, tile)).toEqual(expected);
    });

    test('keeps the margin when the stage is smaller than the view', () => {
        expect(cornerPosition('bottom-right', {width: 100, height: 50}, tile)).toEqual({x: SELF_VIEW_MARGIN_PX, y: SELF_VIEW_MARGIN_PX});
    });
});

describe('nearestCorner', () => {
    test.each([
        [{x: 10, y: 10}, 'top-left'],
        [{x: 700, y: 20}, 'top-right'],
        [{x: 50, y: 400}, 'bottom-left'],
        [{x: 780, y: 470}, 'bottom-right'],
    ] as const)('picks the corner on the side of the view\'s centre at %o', (position, expected) => {
        expect(nearestCorner(position, container, tile)).toBe(expected);
    });
});

describe('clampPosition', () => {
    test('keeps the view inside the stage', () => {
        expect(clampPosition({x: -50, y: 900}, container, tile)).toEqual({x: 0, y: 600 - 112});
    });
});

describe('projectPosition', () => {
    test('carries a flick forward by its release velocity', () => {
        expect(projectPosition({x: 100, y: 100}, {x: 2, y: -1}, 200)).toEqual({x: 500, y: -100});
    });

    test('lets a throw from the left land in a right corner', () => {
        const projected = projectPosition({x: 300, y: 50}, {x: 2, y: 0});

        expect(nearestCorner(projected, container, tile)).toBe('top-right');
    });
});

describe('cornerForArrowKey', () => {
    test.each([
        ['top-left', 'ArrowRight', 'top-right'],
        ['top-left', 'ArrowDown', 'bottom-left'],
        ['bottom-right', 'ArrowLeft', 'bottom-left'],
        ['bottom-right', 'ArrowUp', 'top-right'],
    ] as const)('moves from %s with %s to %s', (corner, key, expected) => {
        expect(cornerForArrowKey(corner, key)).toBe(expected);
    });

    test.each([
        ['top-left', 'ArrowLeft'],
        ['top-left', 'ArrowUp'],
        ['bottom-right', 'ArrowRight'],
        ['bottom-right', 'ArrowDown'],
        ['top-left', 'Enter'],
    ] as const)('returns null from %s with %s', (corner, key) => {
        expect(cornerForArrowKey(corner, key)).toBeNull();
    });
});

describe('spring', () => {
    test('settles on the target', () => {
        const target = {x: 400, y: 300};
        let state: SpringState = {position: {x: 0, y: 0}, velocity: {x: 0, y: 0}};
        for (let i = 0; i < 120 && !springSettled(state, target); i++) {
            state = springStep(state, target, 1 / 60);
        }

        expect(springSettled(state, target)).toBe(true);
    });

    test('caps a long frame so it does not overshoot wildly', () => {
        const target = {x: 100, y: 0};
        const state = springStep({position: {x: 0, y: 0}, velocity: {x: 0, y: 0}}, target, 5);

        expect(state.position.x).toBeLessThan(target.x * 2);
    });
});

describe('self view state', () => {
    beforeEach(() => {
        window.currentCallData = {...CurrentCallDataDefault};
    });

    test('defaults to the bottom right, shown', () => {
        expect(readSelfViewState()).toEqual(SELF_VIEW_STATE_DEFAULT);
    });

    test('remembers the corner and hidden state for the call', () => {
        writeSelfViewState({corner: 'top-left'});
        writeSelfViewState({hidden: true});

        expect(readSelfViewState()).toEqual({corner: 'top-left', hidden: true});
    });

    test('starts over with a new call', () => {
        writeSelfViewState({corner: 'top-left'});
        window.currentCallData = {...CurrentCallDataDefault};

        expect(readSelfViewState()).toEqual(SELF_VIEW_STATE_DEFAULT);
    });
});
