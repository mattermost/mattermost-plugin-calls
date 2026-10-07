// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {PhoneSessionState} from 'src/types/types';

import {
    getPhoneCallProps,
    getPhoneCallPropsFromPostProps,
    isSIPSession,
    phoneNumberForDisplay,
    toSIPCallStatus,
    withoutSIPSessions,
} from './phone_utils';

describe('phone_utils', () => {
    describe('getPhoneCallProps', () => {
        it('returns undefined when the call is not a phone call', () => {
            expect(getPhoneCallProps(undefined)).toBeUndefined();
            expect(getPhoneCallProps({})).toBeUndefined();
            expect(getPhoneCallProps({phone_number: '+15551234567'})).toBeUndefined();
        });

        it('maps the server fields', () => {
            expect(getPhoneCallProps({
                type: 'phone',
                phone_number: '+15551234567',
                display_number: '(555) 123-4567',
                display_label: 'Mobile',
                target_user_id: 'userA',
            })).toEqual({
                number: '+15551234567',
                displayNumber: '(555) 123-4567',
                label: 'Mobile',
                targetUserID: 'userA',
            });
        });

        it('defaults missing optional fields to empty strings', () => {
            expect(getPhoneCallProps({type: 'phone', phone_number: '+15551234567'})).toEqual({
                number: '+15551234567',
                displayNumber: '',
                label: '',
                targetUserID: '',
            });
        });
    });

    describe('getPhoneCallPropsFromPostProps', () => {
        it('reads call_type instead of type', () => {
            expect(getPhoneCallPropsFromPostProps(undefined)).toBeUndefined();
            expect(getPhoneCallPropsFromPostProps({})).toBeUndefined();
            expect(getPhoneCallPropsFromPostProps({
                call_type: 'phone',
                phone_number: '+15551234567',
                display_label: 'Work',
            })).toEqual({
                number: '+15551234567',
                displayNumber: '',
                label: 'Work',
                targetUserID: '',
            });
        });
    });

    describe('toSIPCallStatus', () => {
        it('accepts known statuses only', () => {
            expect(toSIPCallStatus('dialing')).toBe('dialing');
            expect(toSIPCallStatus('ringing')).toBe('ringing');
            expect(toSIPCallStatus('automation')).toBe('automation');
            expect(toSIPCallStatus('active')).toBe('active');
            expect(toSIPCallStatus('hangup')).toBe('hangup');
            expect(toSIPCallStatus('')).toBeUndefined();
            expect(toSIPCallStatus(undefined)).toBeUndefined();
            expect(toSIPCallStatus('bogus')).toBeUndefined();
        });
    });

    describe('isSIPSession', () => {
        it('detects the phone leg', () => {
            expect(isSIPSession(undefined)).toBe(false);
            expect(isSIPSession({})).toBe(false);
            expect(isSIPSession({is_sip_participant: false})).toBe(false);
            expect(isSIPSession({is_sip_participant: true})).toBe(true);
        });
    });

    describe('withoutSIPSessions', () => {
        it('drops the phone leg and keeps everyone else', () => {
            const caller: PhoneSessionState = {session_id: 'sessA', user_id: 'userA', unmuted: true, raised_hand: 0};
            const phone: PhoneSessionState = {session_id: 'sessSIP', user_id: 'sip_123', unmuted: true, raised_hand: 0, is_sip_participant: true};
            expect(withoutSIPSessions([caller, phone])).toEqual([caller]);
            expect(withoutSIPSessions([])).toEqual([]);
        });
    });

    describe('phoneNumberForDisplay', () => {
        it('prefers the display number', () => {
            expect(phoneNumberForDisplay(undefined)).toBe('');
            expect(phoneNumberForDisplay({number: '+15551234567', displayNumber: ''})).toBe('+15551234567');
            expect(phoneNumberForDisplay({number: '+15551234567', displayNumber: '(555) 123-4567'})).toBe('(555) 123-4567');
        });
    });
});
