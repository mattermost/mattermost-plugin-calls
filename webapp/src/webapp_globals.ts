// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {GlobalState} from '@mattermost/types/store';
import {ActionFunc, ActionFuncAsync} from 'mattermost-redux/types/actions';
import {WebAppUtils} from 'src/types/mattermost-webapp';

export const {
    modals,
    notificationSounds,
    sendDesktopNotificationToMe,
}: WebAppUtils =

// @ts-ignore
global.WebappUtils ?? {};

// @ts-ignore
export const openPricingModal = global.openPricingModal;

export const {
    closeRhs,
    selectRhsPost,
    getRhsSelectedPostId,
    getIsRhsOpen,

}: {
    closeRhs?: () => ActionFunc;
    selectRhsPost?: (postId: string) => ActionFuncAsync;
    getRhsSelectedPostId?: (state: GlobalState) => string | undefined;
    getIsRhsOpen?: (state: GlobalState) => boolean;

    // @ts-ignore
} = global.ProductApi ?? {};
