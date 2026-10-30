// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {sipOutboundEnabled} from 'src/selectors';

const stateWith = (callsConfig: Record<string, unknown>) => ({
    'plugins-com.mattermost.calls': {callsConfig},
} as any);

describe('sipOutboundEnabled', () => {
    it.each([
        [true, true, true],
        [true, false, false],
        [false, true, false],
        [false, false, false],
    ])('EnableSIPOutbound=%s, SIPOutboundAllowed=%s => %s', (enabled, allowed, expected) => {
        const state = stateWith({EnableSIPOutbound: enabled, SIPOutboundAllowed: allowed});
        expect(sipOutboundEnabled(state)).toBe(expected);
    });
});
