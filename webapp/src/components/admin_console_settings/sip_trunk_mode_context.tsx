// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {createContext} from 'react';

export type SIPTrunkMode = 'existing' | 'managed';

type SIPTrunkModeContextValue = {
    mode: SIPTrunkMode;
    setMode: (mode: SIPTrunkMode) => void;
};

export const SIPTrunkModeContext = createContext<SIPTrunkModeContextValue>({
    mode: 'existing',
    setMode: () => undefined,
});
