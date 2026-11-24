// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useRef, useState} from 'react';
import type {SelfViewCorner} from 'src/types/types';

import {
    clampPosition,
    cornerForArrowKey,
    cornerPosition,
    nearestCorner,
    Point,
    prefersReducedMotion,
    projectPosition,
    Size,
    springSettled,
    SpringState,
    springStep,
} from './self_view_position';

export type CornerChangeReason = 'drag' | 'keyboard' | 'menu';

type Options = {
    initialCorner: SelfViewCorner;
    onCornerChange: (corner: SelfViewCorner, reason: CornerChangeReason) => void;
};

type DragState = {
    pointerID: number;
    startPointer: Point;
    startPosition: Point;
    startCorner: SelfViewCorner;
    moved: boolean;
    samples: Array<Point & {t: number}>;
};

// Pointer movement under this is a click, not a drag.
const DRAG_THRESHOLD_PX = 4;

// Only the last stretch of a drag sets the release velocity, so a pause before letting go stops the throw.
const VELOCITY_WINDOW_MS = 100;

const ZERO: Point = {x: 0, y: 0};

const sizeOf = (el: HTMLElement | null): Size => ({width: el?.clientWidth ?? 0, height: el?.clientHeight ?? 0});

const releaseVelocity = (samples: DragState['samples']): Point => {
    if (samples.length < 2) {
        return ZERO;
    }
    const first = samples[0];
    const last = samples[samples.length - 1];
    const dt = last.t - first.t;
    if (dt <= 0) {
        return ZERO;
    }
    return {x: (last.x - first.x) / dt, y: (last.y - first.y) / dt};
};

const isFromControl = (target: EventTarget) => target instanceof Element && Boolean(target.closest('button, [role="menu"]'));

export function useSelfViewPosition({initialCorner, onCornerChange}: Options) {
    const [corner, setCorner] = useState(initialCorner);
    const [dragging, setDragging] = useState(false);

    const containerRef = useRef<HTMLDivElement | null>(null);
    const tileRef = useRef<HTMLDivElement | null>(null);
    const cornerRef = useRef(initialCorner);
    const springRef = useRef<SpringState>({position: ZERO, velocity: ZERO});
    const frameRef = useRef<number | null>(null);
    const dragRef = useRef<DragState | null>(null);
    const onCornerChangeRef = useRef(onCornerChange);
    onCornerChangeRef.current = onCornerChange;

    const apply = () => {
        const {x, y} = springRef.current.position;
        if (tileRef.current) {
            tileRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        }
    };

    const targetFor = (target: SelfViewCorner) => cornerPosition(target, sizeOf(containerRef.current), sizeOf(tileRef.current));

    const stopAnimation = () => {
        if (frameRef.current !== null) {
            cancelAnimationFrame(frameRef.current);
            frameRef.current = null;
        }
    };

    const snap = useCallback(() => {
        stopAnimation();
        springRef.current = {position: targetFor(cornerRef.current), velocity: ZERO};
        apply();
    }, []);

    const settle = () => {
        stopAnimation();
        if (prefersReducedMotion()) {
            snap();
            return;
        }

        let last = performance.now();
        const frame = (now: number) => {
            const target = targetFor(cornerRef.current);
            springRef.current = springStep(springRef.current, target, (now - last) / 1000);
            last = now;
            if (springSettled(springRef.current, target)) {
                springRef.current = {position: target, velocity: ZERO};
                apply();
                frameRef.current = null;
                return;
            }
            apply();
            frameRef.current = requestAnimationFrame(frame);
        };
        frameRef.current = requestAnimationFrame(frame);
    };

    const changeCorner = (next: SelfViewCorner, reason: CornerChangeReason) => {
        const changed = next !== cornerRef.current;
        cornerRef.current = next;
        setCorner(next);
        settle();
        if (changed) {
            onCornerChangeRef.current(next, reason);
        }
    };

    const endDrag = (target: HTMLElement | null) => {
        const drag = dragRef.current;
        if (drag && target?.hasPointerCapture?.(drag.pointerID)) {
            target.releasePointerCapture(drag.pointerID);
        }
        dragRef.current = null;
        setDragging(false);
    };

    const cancelDrag = () => {
        const drag = dragRef.current;
        if (!drag) {
            return;
        }
        endDrag(tileRef.current);
        cornerRef.current = drag.startCorner;
        setCorner(drag.startCorner);
        springRef.current = {...springRef.current, velocity: ZERO};
        settle();
    };

    const cancelDragRef = useRef(cancelDrag);
    cancelDragRef.current = cancelDrag;

    useEffect(() => {
        if (!dragging) {
            return undefined;
        }
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                cancelDragRef.current();
            }
        };
        window.addEventListener('keydown', onKeyDown, true);
        return () => window.removeEventListener('keydown', onKeyDown, true);
    }, [dragging]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container || typeof ResizeObserver === 'undefined') {
            return undefined;
        }
        const observer = new ResizeObserver(() => {
            if (!dragRef.current && frameRef.current === null) {
                snap();
            }
        });
        observer.observe(container);
        return () => observer.disconnect();
    }, [snap]);

    useEffect(() => stopAnimation, []);

    // A callback ref, so the view lands in its corner whenever it is shown again.
    const setTileElement = useCallback((el: HTMLDivElement | null) => {
        tileRef.current = el;
        if (el) {
            snap();
        }
    }, [snap]);

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!e.isPrimary || e.button !== 0 || isFromControl(e.target)) {
            return;
        }
        stopAnimation();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        dragRef.current = {
            pointerID: e.pointerId,
            startPointer: {x: e.clientX, y: e.clientY},
            startPosition: springRef.current.position,
            startCorner: cornerRef.current,
            moved: false,
            samples: [{x: e.clientX, y: e.clientY, t: e.timeStamp}],
        };
        setDragging(true);
    };

    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerID !== e.pointerId) {
            return;
        }
        const dx = e.clientX - drag.startPointer.x;
        const dy = e.clientY - drag.startPointer.y;
        if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) {
            return;
        }
        drag.moved = true;
        drag.samples = [...drag.samples, {x: e.clientX, y: e.clientY, t: e.timeStamp}]
            .filter((sample) => e.timeStamp - sample.t <= VELOCITY_WINDOW_MS);
        springRef.current = {
            position: clampPosition({x: drag.startPosition.x + dx, y: drag.startPosition.y + dy}, sizeOf(containerRef.current), sizeOf(tileRef.current)),
            velocity: ZERO,
        };
        apply();
    };

    const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerID !== e.pointerId) {
            return;
        }
        endDrag(e.currentTarget);
        if (!drag.moved) {
            settle();
            return;
        }
        const velocity = releaseVelocity(drag.samples);
        springRef.current = {...springRef.current, velocity: {x: velocity.x * 1000, y: velocity.y * 1000}};
        const projected = projectPosition(springRef.current.position, velocity);
        changeCorner(nearestCorner(projected, sizeOf(containerRef.current), sizeOf(tileRef.current)), 'drag');
    };

    const onPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
        if (dragRef.current?.pointerID === e.pointerId) {
            cancelDrag();
        }
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.target !== e.currentTarget) {
            return;
        }
        const next = cornerForArrowKey(cornerRef.current, e.key);
        if (next) {
            e.preventDefault();
            changeCorner(next, 'keyboard');
        }
    };

    return {
        corner,
        dragging,
        containerRef,
        setTileElement,
        moveTo: (next: SelfViewCorner) => changeCorner(next, 'menu'),
        tileHandlers: {onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onKeyDown},
    };
}
