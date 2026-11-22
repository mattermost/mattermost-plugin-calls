// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {GlobalState} from '@mattermost/types/store';
import {callEnded, unInitialized} from 'src/state/session/actions';
import {PhoneLeg} from 'src/types/types';

import {phoneLegStatusChanged} from './actions';
import {reducer} from './reducer';
import {
    isCurrentPhoneCallActive,
    isCurrentPhoneCallRinging,
    phoneLegForCallInChannel,
    phoneLegForCurrentCall,
} from './selectors';

describe('phoneLegs reducer', () => {
    it('starts empty', () => {
        expect(reducer(undefined, {type: 'unknown'} as never)).toEqual({});
    });

    it('records the latest status per channel', () => {
        let state = reducer(undefined, phoneLegStatusChanged('channelA', 'dialing', 100));
        expect(state).toEqual({channelA: {status: 'dialing', answeredAt: 0}});

        state = reducer(state, phoneLegStatusChanged('channelA', 'ringing', 200));
        expect(state.channelA).toEqual({status: 'ringing', answeredAt: 0});

        state = reducer(state, phoneLegStatusChanged('channelB', 'dialing', 300));
        expect(Object.keys(state)).toEqual(['channelA', 'channelB']);
    });

    it('sets answeredAt on the first active status only', () => {
        let state = reducer(undefined, phoneLegStatusChanged('channelA', 'ringing', 100));
        state = reducer(state, phoneLegStatusChanged('channelA', 'active', 200));
        expect(state.channelA).toEqual({status: 'active', answeredAt: 200});

        state = reducer(state, phoneLegStatusChanged('channelA', 'active', 300));
        expect(state.channelA.answeredAt).toBe(200);

        state = reducer(state, phoneLegStatusChanged('channelA', 'hangup', 400));
        expect(state.channelA).toEqual({status: 'hangup', answeredAt: 200});
    });

    it('returns the same state when nothing changed', () => {
        const state = reducer(undefined, phoneLegStatusChanged('channelA', 'ringing', 100));
        expect(reducer(state, phoneLegStatusChanged('channelA', 'ringing', 200))).toBe(state);
    });

    it('clears the channel when the call ends', () => {
        let state = reducer(undefined, phoneLegStatusChanged('channelA', 'active', 100));
        state = reducer(state, phoneLegStatusChanged('channelB', 'ringing', 100));

        const sameState = reducer(state, callEnded('channelC', 'callC'));
        expect(sameState).toBe(state);

        state = reducer(state, callEnded('channelA', 'callA'));
        expect(state).toEqual({channelB: {status: 'ringing', answeredAt: 0}});
    });

    it('resets on un-initialize', () => {
        const state = reducer(undefined, phoneLegStatusChanged('channelA', 'active', 100));
        expect(reducer(state, unInitialized())).toEqual({});
    });
});

describe('phoneLegs selectors', () => {
    const phone = {number: '+15550100', displayNumber: '(555) 0100', label: '', targetUserID: ''};

    const stateWith = ({phoneLeg, isPhoneCall = true}: {phoneLeg?: PhoneLeg; isPhoneCall?: boolean}) => ({
        'plugins-com.mattermost.calls': {
            calls: {channelA: {phone: isPhoneCall ? phone : undefined}},
            phoneLegs: phoneLeg ? {channelA: phoneLeg} : {},
            clientStateReducer: {channelID: 'channelA'},
        },
    } as unknown as GlobalState);

    const ringing: PhoneLeg = {status: 'ringing', answeredAt: 0};
    const active: PhoneLeg = {status: 'active', answeredAt: 200};
    const hungUp: PhoneLeg = {status: 'hangup', answeredAt: 200};

    it('phoneLegForCallInChannel returns the phone leg of the given channel', () => {
        const state = stateWith({phoneLeg: ringing});

        expect(phoneLegForCallInChannel(state, 'channelA')).toBe(ringing);
        expect(phoneLegForCallInChannel(state, 'channelB')).toBeUndefined();
    });

    it('phoneLegForCurrentCall returns the phone leg of the current call', () => {
        expect(phoneLegForCurrentCall(stateWith({phoneLeg: active}))).toBe(active);
        expect(phoneLegForCurrentCall(stateWith({}))).toBeUndefined();
    });

    it.each([
        ['no status yet', undefined, true, true, false],
        ['ringing', ringing, true, true, false],
        ['active', active, true, false, true],
        ['hung up after answering', hungUp, true, false, false],
        ['not a phone call', active, false, false, false],
    ])('isCurrentPhoneCallRinging and isCurrentPhoneCallActive when %s', (_, phoneLeg, isPhoneCall, ringingExpected, activeExpected) => {
        const state = stateWith({phoneLeg, isPhoneCall});

        expect(isCurrentPhoneCallRinging(state)).toBe(ringingExpected);
        expect(isCurrentPhoneCallActive(state)).toBe(activeExpected);
    });
});
