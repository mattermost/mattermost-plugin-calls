// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {dmVideoEnabled} from 'src/selectors';

const stateWith = (callsConfig: Record<string, unknown>) => ({
    'plugins-com.mattermost.calls': {callsConfig},
} as unknown as Parameters<typeof dmVideoEnabled>[0]);

describe('dmVideoEnabled', () => {
    test.each([true, false])('EnableDMVideo=%s', (enabled) => {
        expect(dmVideoEnabled(stateWith({EnableDMVideo: enabled}))).toBe(enabled);
    });
});
