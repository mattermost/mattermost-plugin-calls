// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {DTMF_DIGITS, dtmfCode, DTMFDigit, isDTMFDigit} from './dtmf';

describe('dtmf', () => {
    describe('dtmfCode', () => {
        it('maps 0-9 to their own value', () => {
            for (let n = 0; n <= 9; n++) {
                expect(dtmfCode(String(n) as DTMFDigit)).toBe(n);
            }
        });

        it('maps * to 10 and # to 11', () => {
            expect(dtmfCode('*')).toBe(10);
            expect(dtmfCode('#')).toBe(11);
        });
    });

    describe('isDTMFDigit', () => {
        it('accepts every keypad digit', () => {
            for (const digit of DTMF_DIGITS) {
                expect(isDTMFDigit(digit)).toBe(true);
            }
        });

        it('rejects dialer-only and other characters', () => {
            for (const key of ['+', ',', ';', 'A', 'a', 'w', 'p', ' ', '', '10', 'Enter']) {
                expect(isDTMFDigit(key)).toBe(false);
            }
        });
    });
});
