// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {GlobalState} from '@mattermost/types/lib/store';
import {Thunk, Action} from 'mattermost-redux/types/actions';

export const {
    modals,

// @ts-ignore
}: { modals: any } = global.WebappUtils ?? {};

// @ts-ignore
export const openPricingModal = global.openPricingModal;

export const {
    closeRhs,
    selectRhsPost,
    getRhsSelectedPostId,
    getIsRhsOpen,

}: {
    closeRhs?: () => Thunk;
    selectRhsPost?: (postId: string) => Thunk;
    getRhsSelectedPostId?: (state: GlobalState) => string | undefined;
    getIsRhsOpen?: (state: GlobalState) => boolean;

    // @ts-ignore
} = global.ProductApi ?? {};
