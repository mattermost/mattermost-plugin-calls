// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {LOWER_HAND_ON_UNMUTE_DELAY_MS} from 'src/constants';
import {createLowerHandOnUnmute} from 'src/lower_hand_on_unmute';

const OWN_SESSION = 'own-session';
const OTHER_SESSION = 'other-session';

describe('createLowerHandOnUnmute', () => {
    let enabled: boolean;
    let handRaised: boolean;
    let lowerHand: jest.Mock;

    const setup = () => createLowerHandOnUnmute({
        getOwnSessionID: () => OWN_SESSION,
        isEnabled: () => enabled,
        isOwnHandRaised: () => handRaised,
        lowerHand,
    });

    beforeEach(() => {
        jest.useFakeTimers();
        enabled = true;
        handRaised = true;
        lowerHand = jest.fn();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('lowers hand after staying unmuted for the full delay', () => {
        const handler = setup();
        handler.onUnmute(OWN_SESSION);

        jest.advanceTimersByTime(LOWER_HAND_ON_UNMUTE_DELAY_MS - 1);
        expect(lowerHand).not.toHaveBeenCalled();

        jest.advanceTimersByTime(1);
        expect(lowerHand).toHaveBeenCalledTimes(1);
    });

    test('does nothing when the setting is disabled', () => {
        enabled = false;
        const handler = setup();
        handler.onUnmute(OWN_SESSION);

        jest.advanceTimersByTime(LOWER_HAND_ON_UNMUTE_DELAY_MS * 2);
        expect(lowerHand).not.toHaveBeenCalled();
    });

    test('does nothing when the hand was not raised at unmute time', () => {
        handRaised = false;
        const handler = setup();
        handler.onUnmute(OWN_SESSION);

        // Raising the hand after unmuting must not get it lowered.
        handRaised = true;
        jest.advanceTimersByTime(LOWER_HAND_ON_UNMUTE_DELAY_MS * 2);
        expect(lowerHand).not.toHaveBeenCalled();
    });

    test('does not lower if the hand was already lowered before the delay elapsed', () => {
        const handler = setup();
        handler.onUnmute(OWN_SESSION);

        handRaised = false;
        jest.advanceTimersByTime(LOWER_HAND_ON_UNMUTE_DELAY_MS);
        expect(lowerHand).not.toHaveBeenCalled();
    });

    test('muting before the delay cancels it', () => {
        const handler = setup();
        handler.onUnmute(OWN_SESSION);

        jest.advanceTimersByTime(LOWER_HAND_ON_UNMUTE_DELAY_MS - 1);
        handler.onMute(OWN_SESSION);

        jest.advanceTimersByTime(LOWER_HAND_ON_UNMUTE_DELAY_MS * 2);
        expect(lowerHand).not.toHaveBeenCalled();
    });

    test('unmuting again restarts the delay', () => {
        const handler = setup();
        handler.onUnmute(OWN_SESSION);
        jest.advanceTimersByTime(LOWER_HAND_ON_UNMUTE_DELAY_MS - 1);

        handler.onMute(OWN_SESSION);
        handler.onUnmute(OWN_SESSION);

        jest.advanceTimersByTime(LOWER_HAND_ON_UNMUTE_DELAY_MS - 1);
        expect(lowerHand).not.toHaveBeenCalled();

        jest.advanceTimersByTime(1);
        expect(lowerHand).toHaveBeenCalledTimes(1);
    });

    test('ignores other participants unmuting', () => {
        const handler = setup();
        handler.onUnmute(OTHER_SESSION);

        jest.advanceTimersByTime(LOWER_HAND_ON_UNMUTE_DELAY_MS * 2);
        expect(lowerHand).not.toHaveBeenCalled();
    });

    test('ignores other participants muting', () => {
        const handler = setup();
        handler.onUnmute(OWN_SESSION);
        handler.onMute(OTHER_SESSION);

        jest.advanceTimersByTime(LOWER_HAND_ON_UNMUTE_DELAY_MS);
        expect(lowerHand).toHaveBeenCalledTimes(1);
    });

    test('ignores events when the own session ID is unknown', () => {
        const handler = createLowerHandOnUnmute({
            getOwnSessionID: () => null,
            isEnabled: () => true,
            isOwnHandRaised: () => true,
            lowerHand,
        });
        handler.onUnmute('');

        jest.advanceTimersByTime(LOWER_HAND_ON_UNMUTE_DELAY_MS * 2);
        expect(lowerHand).not.toHaveBeenCalled();
    });

    test('dispose cancels a pending lower', () => {
        const handler = setup();
        handler.onUnmute(OWN_SESSION);
        handler.dispose();

        jest.advanceTimersByTime(LOWER_HAND_ON_UNMUTE_DELAY_MS * 2);
        expect(lowerHand).not.toHaveBeenCalled();
    });
});
