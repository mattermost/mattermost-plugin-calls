// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

export type NoticeKind = 'joined' | 'left' | 'hand' | 'host' | 'removed' | 'recording';

export type StackNotice = {
    id: string;
    kind: NoticeKind;
    message: string;

    // Transient notices fade on their own; the rest stay until dismissed.
    transient: boolean;
    leaving: boolean;
};

export const MAX_NOTICES = 5;
export const NOTICE_TIMEOUT_MS = 3000;
export const NOTICE_FADE_MS = 200;

// When the stack is full the oldest transient notice goes first, so lasting ones aren't pushed off.
export function addNotice(notices: StackNotice[], notice: StackNotice, max = MAX_NOTICES): StackNotice[] {
    const next = [...notices, notice];
    while (next.length > max) {
        const oldestTransient = next.findIndex((n) => n.transient);
        next.splice(oldestTransient >= 0 ? oldestTransient : 0, 1);
    }
    return next;
}

export function markLeaving(notices: StackNotice[], id: string): StackNotice[] {
    return notices.map((n) => (n.id === id ? {...n, leaving: true} : n));
}

export function removeNotice(notices: StackNotice[], id: string): StackNotice[] {
    return notices.filter((n) => n.id !== id);
}
