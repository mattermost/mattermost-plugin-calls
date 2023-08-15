// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Channel} from '@mattermost/types/channels';
import {GlobalState} from '@mattermost/types/store';
import {DispatchFunc, Thunk} from 'mattermost-redux/types/actions';

export const {
    modals,
    notificationSounds,
    sendDesktopNotificationToMe,
}: {

    // @ts-ignore
    modals: { openModal, ModalIdentifiers },
    notificationSounds: { ring: (sound: string) => void, stopRing: () => void },
    sendDesktopNotificationToMe: (title: string, body: string, channel: Channel, teamId: string, silent: boolean, soundName: string, url: string) => (dispatch: DispatchFunc) => void,
} =

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
    closeRhs?: () => Thunk;
    selectRhsPost?: (postId: string) => Thunk;
    getRhsSelectedPostId?: (state: GlobalState) => string | undefined;
    getIsRhsOpen?: (state: GlobalState) => boolean;

    // @ts-ignore
} = global.ProductApi ?? {};
