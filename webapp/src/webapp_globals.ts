// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

export const {
    modals,

// @ts-ignore
}: { modals: any } = global.WebappUtils ?? {};

// @ts-ignore
export const openPricingModal = global.openPricingModal;

export const {
    Timestamp,
    Textbox,

    // @ts-ignore
} = global.Components ?? {};

export const {
    formatText,
    messageHtmlToComponent,

    // @ts-ignore
} = global.PostUtils ?? {};
