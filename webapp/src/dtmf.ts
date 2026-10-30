// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

export const DTMF_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'] as const;

export type DTMFDigit = typeof DTMF_DIGITS[number];

// RFC 4733 event codes, as LiveKit's publishDtmf expects them.
const DTMF_CODES: Record<DTMFDigit, number> = {
    0: 0,
    1: 1,
    2: 2,
    3: 3,
    4: 4,
    5: 5,
    6: 6,
    7: 7,
    8: 8,
    9: 9,
    '*': 10,
    '#': 11,
};

export function dtmfCode(digit: DTMFDigit): number {
    return DTMF_CODES[digit];
}

export function isDTMFDigit(key: string): key is DTMFDigit {
    return (DTMF_DIGITS as ReadonlyArray<string>).includes(key);
}
