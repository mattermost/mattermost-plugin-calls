// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {GlobalState} from '@mattermost/types/store';

import {pluginId} from './manifest';
import {callState} from './reducers';
import {isPhoneCall, isPhoneCallForCurrentCall, sipCallDetailsForCallInChannel} from './selectors';
import {CallDirection, SipCallDetails} from './state/sip_call_details/reducer';

const phoneCall: callState = {
    callID: 'call1',
    channelID: 'chPhone',
    startAt: 100,
    threadID: 'thread1',
    ownerID: 'owner1',
};

const phoneSip: SipCallDetails = {
    direction: CallDirection.Outbound,
    phone_number: '+15551234567',
    display_number: '(555) 123-4567',
    label: 'DSN',
    user_id: 'user1',
};

const audioCall: callState = {
    callID: 'call2',
    channelID: 'chAudio',
    startAt: 200,
    threadID: 'thread2',
    ownerID: 'owner2',
};

const buildState = (currentChannelID = ''): GlobalState => ({
    [`plugins-${pluginId}`]: {
        activeCalls: {
            chPhone: phoneCall,
            chAudio: audioCall,
        },
        sipCallDetails: {
            chPhone: phoneSip,
        },
        clientStateReducer: {channelID: currentChannelID},
    },
} as unknown as GlobalState);

describe('selectors phone-call props', () => {
    const state = buildState();

    describe('sipCallDetailsForCallInChannel', () => {
        it('returns the sip details for a phone call', () => {
            expect(sipCallDetailsForCallInChannel(state, 'chPhone')).toEqual(phoneSip);
        });

        it('returns undefined for an audio call', () => {
            expect(sipCallDetailsForCallInChannel(state, 'chAudio')).toBeUndefined();
        });

        it('returns undefined for an unknown channel', () => {
            expect(sipCallDetailsForCallInChannel(state, 'missing')).toBeUndefined();
        });
    });

    describe('isPhoneCall', () => {
        it('is true only for a phone call', () => {
            expect(isPhoneCall(state, 'chPhone')).toBe(true);
        });

        it('is false for an audio call', () => {
            expect(isPhoneCall(state, 'chAudio')).toBe(false);
        });

        it('is false for an unknown channel', () => {
            expect(isPhoneCall(state, 'missing')).toBe(false);
        });
    });

    describe('isPhoneCallForCurrentCall', () => {
        it('is true when the current call is a phone call', () => {
            expect(isPhoneCallForCurrentCall(buildState('chPhone'))).toBe(true);
        });

        it('is false when the current call is an audio call', () => {
            expect(isPhoneCallForCurrentCall(buildState('chAudio'))).toBe(false);
        });

        it('is false when there is no current call', () => {
            expect(isPhoneCallForCurrentCall(buildState(''))).toBe(false);
        });
    });
});
