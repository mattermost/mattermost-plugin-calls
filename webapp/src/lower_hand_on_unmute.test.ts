// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {LOWER_HAND_ON_UNMUTE_DELAY_MS} from 'src/constants';
import {createLowerHandOnUnmute} from 'src/lower_hand_on_unmute';

describe('createLowerHandOnUnmute', () => {
    let enabled: boolean;
    let raisedAt: number;
    let lowerHand: jest.Mock;

    const setup = () => createLowerHandOnUnmute({
        isEnabled: () => enabled,
        ownHandRaisedAt: () => raisedAt,
        lowerHand,
    });

    beforeEach(() => {
        jest.useFakeTimers();
        enabled = true;
        raisedAt = 1700000000000;
        lowerHand = jest.fn();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('lowers hand after staying unmuted for the full delay', () => {
        const handler = setup();
        handler.onUnmute();

        jest.advanceTimersByTime(LOWER_HAND_ON_UNMUTE_DELAY_MS - 1);
        expect(lowerHand).not.toHaveBeenCalled();

        jest.advanceTimersByTime(1);
        expect(lowerHand).toHaveBeenCalledTimes(1);
    });

    test('does nothing when the setting is disabled', () => {
        enabled = false;
        const handler = setup();
        handler.onUnmute();

        jest.advanceTimersByTime(LOWER_HAND_ON_UNMUTE_DELAY_MS * 2);
        expect(lowerHand).not.toHaveBeenCalled();
    });

    test('does nothing when the hand was not raised at unmute time', () => {
        raisedAt = 0;
        const handler = setup();
        handler.onUnmute();

        // Raising the hand after unmuting must not get it lowered.
        raisedAt = 1700000001000;
        jest.advanceTimersByTime(LOWER_HAND_ON_UNMUTE_DELAY_MS * 2);
        expect(lowerHand).not.toHaveBeenCalled();
    });

    test('does not lower if the hand was already lowered before the delay elapsed', () => {
        const handler = setup();
        handler.onUnmute();

        raisedAt = 0;
        jest.advanceTimersByTime(LOWER_HAND_ON_UNMUTE_DELAY_MS);
        expect(lowerHand).not.toHaveBeenCalled();
    });

    test('does not lower a hand that was lowered and raised again during the delay', () => {
        const handler = setup();
        handler.onUnmute();

        jest.advanceTimersByTime(LOWER_HAND_ON_UNMUTE_DELAY_MS - 1);
        raisedAt = 1700000005000;
        jest.advanceTimersByTime(1);
        expect(lowerHand).not.toHaveBeenCalled();
    });

    test('cancel stops a pending lower', () => {
        const handler = setup();
        handler.onUnmute();

        jest.advanceTimersByTime(LOWER_HAND_ON_UNMUTE_DELAY_MS - 1);
        handler.cancel();

        jest.advanceTimersByTime(LOWER_HAND_ON_UNMUTE_DELAY_MS * 2);
        expect(lowerHand).not.toHaveBeenCalled();
    });

    test('muting before the delay cancels it', () => {
        const handler = setup();
        handler.onUnmute();

        jest.advanceTimersByTime(LOWER_HAND_ON_UNMUTE_DELAY_MS - 1);
        handler.onMute();

        jest.advanceTimersByTime(LOWER_HAND_ON_UNMUTE_DELAY_MS * 2);
        expect(lowerHand).not.toHaveBeenCalled();
    });

    test('unmuting again restarts the delay', () => {
        const handler = setup();
        handler.onUnmute();
        jest.advanceTimersByTime(LOWER_HAND_ON_UNMUTE_DELAY_MS - 1);

        handler.onMute();
        handler.onUnmute();

        jest.advanceTimersByTime(LOWER_HAND_ON_UNMUTE_DELAY_MS - 1);
        expect(lowerHand).not.toHaveBeenCalled();

        jest.advanceTimersByTime(1);
        expect(lowerHand).toHaveBeenCalledTimes(1);
    });

    test('does not lower if the setting is turned off during the delay', () => {
        const handler = setup();
        handler.onUnmute();

        jest.advanceTimersByTime(LOWER_HAND_ON_UNMUTE_DELAY_MS - 1);
        enabled = false;
        jest.advanceTimersByTime(1);
        expect(lowerHand).not.toHaveBeenCalled();
    });

    test('dispose cancels a pending lower', () => {
        const handler = setup();
        handler.onUnmute();
        handler.dispose();

        jest.advanceTimersByTime(LOWER_HAND_ON_UNMUTE_DELAY_MS * 2);
        expect(lowerHand).not.toHaveBeenCalled();
    });
});
