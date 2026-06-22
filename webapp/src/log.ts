// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/* eslint-disable no-console */

import {MAX_ACCUMULATED_LOG_SIZE, STORAGE_CALLS_CLIENT_LOGS_KEY} from 'src/constants';
import type {CallsClientStats} from 'src/types/types';
import {getPersistentStorage} from 'src/utils';

import {pluginId} from './manifest';

let clientLogs = '';

// Cap on the serialized length of a single non-string log argument. Objects
// (notably LiveKit SDK objects) can serialize to several KB each, which would
// quickly fill the accumulated log buffer and truncate away the earlier,
// usually more useful, entries. Strings and Error stacks are not capped.
const maxObjectLogLength = 256;

function stringifyLogArg(arg: unknown): string {
    if (typeof arg === 'string') {
        return arg;
    }
    if (arg instanceof Error) {
        return arg.stack || `${arg.name}: ${arg.message}`;
    }
    try {
        const serialized = JSON.stringify(arg) ?? String(arg);
        return serialized.length > maxObjectLogLength ? serialized.slice(0, maxObjectLogLength - 3) + '...' : serialized;
    } catch {
        return String(arg);
    }
}

// Appends a fully-formatted log line to this realm's in-memory buffer. Exposed
// on `window` (below) so the expanded-view popout can write through to its
// opener's buffer rather than persisting separately.
function appendLogLine(line: string) {
    clientLogs += line;
}

function appendClientLog(level: string, ...args: unknown[]) {
    // Serialize in the originating realm: Error/object args belong to this
    // window's realm and would fail `instanceof Error` checks if handed to the
    // opener's realm to format.
    const serialized = args.map(stringifyLogArg).join(' ');
    const line = `${level} [${new Date().toISOString()}] ${serialized}\n`;

    // In the expanded-view popout, route the line to the opener's buffer so
    // popout-realm logs ride the main window's existing flush machinery (single
    // source of truth, no cross-window localStorage read-modify-write race).
    // Don't call isCallsPopOut()/logErr here — that would recurse back through
    // appendClientLog. Inline the opener check and swallow the cross-origin
    // SecurityError, mirroring getCallsWindow().
    try {
        const opener = window.opener as Window | null;
        if (opener && opener !== window && typeof opener.callsClientLogAppend === 'function') {
            opener.callsClientLogAppend(line);
            return;
        }
    } catch {
        // Cross-origin opener (e.g. MM opened from a calendar link): fall
        // through to this realm's local buffer.
    }

    clientLogs += line;
}

// Expose this realm's appender so an expanded-view popout can write its logs
// through to this (the opener's) buffer via window.opener.
if (typeof window !== 'undefined') {
    window.callsClientLogAppend = appendLogLine;
}

export function flushLogsToAccumulated(stats?: CallsClientStats | null) {
    // Append stats if provided
    if (stats) {
        clientLogs += '--- Call Stats ---\n';
        clientLogs += JSON.stringify(stats) + '\n';
        clientLogs += '---\n\n';
    }

    if (!clientLogs.trim()) {
        return; // Nothing to flush
    }

    // Logging is best-effort: a storage failure (e.g. quota exceeded) must
    // never block callers such as connectCall, so swallow any error here. The
    // in-memory buffer is always cleared so it can't grow unbounded.
    try {
        const storage = getPersistentStorage();

        // Get accumulated buffer
        let accumulated = storage.getItem(STORAGE_CALLS_CLIENT_LOGS_KEY) || '';

        // Append in-memory logs to end
        accumulated += clientLogs;

        // Truncate from start if exceeds max. We measure UTF-8 byte size rather
        // than string length (UTF-16 code units) so the buffer stays within the
        // server's byte limit even when logs contain multi-byte characters.
        const bytes = new TextEncoder().encode(accumulated);
        if (bytes.length > MAX_ACCUMULATED_LOG_SIZE) {
            const marker = '[... older logs truncated ...]\n\n';
            const keepSize = MAX_ACCUMULATED_LOG_SIZE - marker.length;

            // Advance the cut point past any partial multi-byte sequence (leading
            // UTF-8 continuation bytes, 0b10xxxxxx) so decoding starts on a
            // character boundary and produces no replacement characters.
            let start = bytes.length - keepSize;
            while (start < bytes.length && (bytes[start] & 0xc0) === 0x80) {
                start++;
            }
            const truncated = new TextDecoder().decode(bytes.slice(start));
            accumulated = marker + truncated;
        }

        // Save back
        storage.setItem(STORAGE_CALLS_CLIENT_LOGS_KEY, accumulated);
    } catch (err) {
        console.error(`${pluginId}: failed to flush logs to storage`, err);
    } finally {
        // Clear memory
        clientLogs = '';
    }
}

export function persistClientLogs() {
    flushLogsToAccumulated();
}

export function getClientLogs() {
    return getPersistentStorage().getItem(STORAGE_CALLS_CLIENT_LOGS_KEY) || '';
}

export function logErr(...args: unknown[]) {
    console.error(`${pluginId}:`, ...args);
    try {
        appendClientLog('error', ...args);
    } catch (err) {
        console.error(err);
    }
}

export function logWarn(...args: unknown[]) {
    console.warn(`${pluginId}:`, ...args);
    appendClientLog('warn', ...args);
}

export function logInfo(...args: unknown[]) {
    console.info(`${pluginId}:`, ...args);
    appendClientLog('info', ...args);
}

export function logDebug(...args: unknown[]) {
    console.debug(`${pluginId}:`, ...args);
    appendClientLog('debug', ...args);
}
