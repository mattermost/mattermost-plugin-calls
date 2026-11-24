// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {SelfViewCorner, SelfViewState} from 'src/types/types';
import {getCallsWindow} from 'src/utils';

export type Point = {x: number; y: number};
export type Size = {width: number; height: number};

export const SELF_VIEW_CORNERS: SelfViewCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

export const SELF_VIEW_STATE_DEFAULT: SelfViewState = {corner: 'bottom-right', hidden: false};

export const SELF_VIEW_MARGIN_PX = 16;

// How far ahead a release is projected, so a flick carries the view toward the corner it was thrown at.
export const MOMENTUM_PROJECTION_MS = 200;

export const SPRING_STIFFNESS = 420;
export const SPRING_DAMPING = 32;

const SETTLED_DISTANCE_PX = 0.5;
const SETTLED_SPEED_PX_PER_S = 10;

// Keeps a long frame, as after a background tab, from overshooting the spring.
const MAX_SPRING_STEP_S = 1 / 30;

export function cornerPosition(corner: SelfViewCorner, container: Size, tile: Size, margin = SELF_VIEW_MARGIN_PX): Point {
    const [vertical, horizontal] = corner.split('-');
    return {
        x: horizontal === 'left' ? margin : Math.max(margin, container.width - tile.width - margin),
        y: vertical === 'top' ? margin : Math.max(margin, container.height - tile.height - margin),
    };
}

export function nearestCorner(position: Point, container: Size, tile: Size): SelfViewCorner {
    const vertical = position.y + (tile.height / 2) < container.height / 2 ? 'top' : 'bottom';
    const horizontal = position.x + (tile.width / 2) < container.width / 2 ? 'left' : 'right';
    return `${vertical}-${horizontal}`;
}

export function clampPosition(position: Point, container: Size, tile: Size): Point {
    return {
        x: Math.min(Math.max(position.x, 0), Math.max(0, container.width - tile.width)),
        y: Math.min(Math.max(position.y, 0), Math.max(0, container.height - tile.height)),
    };
}

// Velocity is in px per ms.
export function projectPosition(position: Point, velocity: Point, projectionMs = MOMENTUM_PROJECTION_MS): Point {
    return {
        x: position.x + (velocity.x * projectionMs),
        y: position.y + (velocity.y * projectionMs),
    };
}

const ARROW_KEY_MOVES: Record<string, (vertical: string, horizontal: string) => SelfViewCorner> = {
    ArrowLeft: (vertical) => `${vertical}-left` as SelfViewCorner,
    ArrowRight: (vertical) => `${vertical}-right` as SelfViewCorner,
    ArrowUp: (_, horizontal) => `top-${horizontal}` as SelfViewCorner,
    ArrowDown: (_, horizontal) => `bottom-${horizontal}` as SelfViewCorner,
};

// Null when the key isn't an arrow, or the view is already as far as it can go that way.
export function cornerForArrowKey(corner: SelfViewCorner, key: string): SelfViewCorner | null {
    const move = Object.hasOwn(ARROW_KEY_MOVES, key) ? ARROW_KEY_MOVES[key] : null;
    if (!move) {
        return null;
    }
    const [vertical, horizontal] = corner.split('-');
    const next = move(vertical, horizontal);
    return next === corner ? null : next;
}

export type SpringState = {
    position: Point;

    // In px per second.
    velocity: Point;
};

export function springStep({position, velocity}: SpringState, target: Point, dtSeconds: number): SpringState {
    const dt = Math.min(dtSeconds, MAX_SPRING_STEP_S);
    const step = (pos: number, vel: number, goal: number) => {
        const acceleration = (-SPRING_STIFFNESS * (pos - goal)) - (SPRING_DAMPING * vel);
        const nextVel = vel + (acceleration * dt);
        return {pos: pos + (nextVel * dt), vel: nextVel};
    };
    const x = step(position.x, velocity.x, target.x);
    const y = step(position.y, velocity.y, target.y);
    return {position: {x: x.pos, y: y.pos}, velocity: {x: x.vel, y: y.vel}};
}

export function springSettled({position, velocity}: SpringState, target: Point) {
    return Math.hypot(position.x - target.x, position.y - target.y) < SETTLED_DISTANCE_PX &&
        Math.hypot(velocity.x, velocity.y) < SETTLED_SPEED_PX_PER_S;
}

export function readSelfViewState(): SelfViewState {
    return getCallsWindow().currentCallData?.selfView ?? SELF_VIEW_STATE_DEFAULT;
}

export function writeSelfViewState(patch: Partial<SelfViewState>) {
    const data = getCallsWindow().currentCallData;
    if (!data) {
        return;
    }
    data.selfView = {...(data.selfView ?? SELF_VIEW_STATE_DEFAULT), ...patch};
}

export const prefersReducedMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
