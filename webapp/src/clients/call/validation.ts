// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {EmojiData} from '@mattermost/calls-common/lib/types';

import type {ReactionPayload} from './types';

const MAX_EMOJI_FIELD_LENGTH = 64;
const UNIFIED_RE = /^[0-9a-f]{1,8}(-[0-9a-f]{1,8})*$/i;

function isBoundedString(v: unknown): v is string {
    return typeof v === 'string' && v.length <= MAX_EMOJI_FIELD_LENGTH;
}

/**
 * Validates untrusted emoji data sent by a peer and returns a clean copy, or
 * null if it is malformed. Only known fields are kept.
 */
export function sanitizeEmojiData(data: unknown): EmojiData | null {
    if (!data || typeof data !== 'object') {
        return null;
    }

    const {name, unified, skin, literal} = data as Record<string, unknown>;
    if (!isBoundedString(name) || !isBoundedString(unified) || !UNIFIED_RE.test(unified)) {
        return null;
    }
    if (skin !== undefined && !isBoundedString(skin)) {
        return null;
    }
    if (literal !== undefined && !isBoundedString(literal)) {
        return null;
    }

    const clean: EmojiData = {name, unified};
    if (skin !== undefined) {
        clean.skin = skin;
    }
    if (literal !== undefined) {
        clean.literal = literal;
    }
    return clean;
}

/**
 * Validates an untrusted, already JSON-parsed reaction payload sent by a peer.
 * Returns null if it is malformed.
 */
export function parseReactionPayload(data: unknown): ReactionPayload | null {
    if (!data || typeof data !== 'object') {
        return null;
    }

    const {emojiData, timestamp} = data as Record<string, unknown>;
    const emoji = sanitizeEmojiData(emojiData);
    if (!emoji || typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
        return null;
    }

    return {emojiData: emoji, timestamp};
}
