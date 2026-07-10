// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/* eslint-disable no-console */

import {MAX_ACCUMULATED_LOG_SIZE, STORAGE_CALLS_CLIENT_LOGS_KEY} from 'src/constants';
import type {CallsClientStats} from 'src/types/types';
import {getPersistentStorage} from 'src/utils';

import {pluginId} from './manifest';

declare global {
    interface Window {
        callsClientLogAppend?: (line: string) => void;
        callsClientFlushAndGetLogs?: () => string;
    }
}

let clientLogs = '';

const maxArgLength = 256;

// Flush the in-memory buffer to storage once it exceeds this size. Keeps
// memory bounded between calls and during plugin-inactive periods when the
// window error/unhandledrejection listeners are still writing to the buffer.
// String .length is O(1) in JS so this check is cheap on every write.
const maxInMemoryLogSize = 50 * 1024;

function maybeFlush() {
    if (clientLogs.length > maxInMemoryLogSize) {
        try {
            flushLogsToAccumulated();
        } catch {
            // Storage quota or security error — keep only the most recent portion in memory.
            clientLogs = clientLogs.slice(-maxInMemoryLogSize);
        }
    }
}

function formatArg(a: unknown): string {
    if (a instanceof Error) {
        return a.message;
    }
    if (typeof a === 'object' && a !== null) {
        try {
            const s = JSON.stringify(a);
            return s.length > maxArgLength ? s.slice(0, maxArgLength - 3) + '...' : s;
        } catch {
            return String(a);
        }
    }
    return String(a);
}

// Appends a fully-formatted log line to this realm's in-memory buffer. Exposed
// on `window` so the expanded-view popout can write through to its opener's
// buffer rather than persisting separately.
function appendLogLine(line: string) {
    clientLogs += line;
    maybeFlush();
}

function appendClientLog(level: string, ...args: unknown[]) {
    // Serialize in the originating realm: Error/object args belong to this
    // window's realm and would fail instanceof checks if passed to the opener.
    const line = `${level} [${new Date().toISOString()}] ${args.map(formatArg).join(' ')}\n`;

    // In the expanded-view popout, route the line to the opener's buffer so
    // popout-realm logs ride the main window's existing flush machinery (single
    // source of truth, no cross-window storage read-modify-write race).
    try {
        const opener = window.opener as Window | null;
        if (opener && opener !== window && typeof opener.callsClientLogAppend === 'function') {
            opener.callsClientLogAppend(line);
            return;
        }
    } catch {
        // Cross-origin opener: fall through to this realm's local buffer.
    }

    clientLogs += line;
    maybeFlush();
}

// Expose this realm's appender and flush+getter so an expanded-view popout can
// write logs through to (and read them back from) the opener's realm.
if (typeof window !== 'undefined') {
    window.callsClientLogAppend = appendLogLine;
    window.callsClientFlushAndGetLogs = flushAndGetLogs;

    // Wire uncaught JS errors and unhandled promise rejections into the client-
    // log buffer. Without this, exceptions that crash a handler go only to
    // console.error and never appear in /call logs uploads.
    window.addEventListener('error', (event: ErrorEvent) => {
        const {message, filename, lineno, colno, error} = event;
        const errStr = error instanceof Error ?
            (error.stack || `${error.name}: ${error.message}`) :
            String(error || message);
        appendClientLog('error', `[uncaught] ${errStr} (${filename}:${lineno}:${colno})`);
    });

    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
        const reason = event.reason instanceof Error ?
            (event.reason.stack || `${event.reason.name}: ${event.reason.message}`) :
            formatArg(event.reason);
        appendClientLog('error', `[unhandledrejection] ${reason}`);
    });
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

    const storage = getPersistentStorage();

    // Get accumulated buffer
    let accumulated = storage.getItem(STORAGE_CALLS_CLIENT_LOGS_KEY) || '';

    // Append in-memory logs to end
    accumulated += clientLogs;

    // Truncate from start if exceeds max
    if (accumulated.length > MAX_ACCUMULATED_LOG_SIZE) {
        const keepSize = MAX_ACCUMULATED_LOG_SIZE - 50;
        const truncated = accumulated.slice(-keepSize);
        accumulated = '[... older logs truncated ...]\n\n' + truncated;
    }

    // Save back
    storage.setItem(STORAGE_CALLS_CLIENT_LOGS_KEY, accumulated);

    // Clear memory
    clientLogs = '';
}

export function persistClientLogs() {
    flushLogsToAccumulated();
}

export function getClientLogs() {
    return getPersistentStorage().getItem(STORAGE_CALLS_CLIENT_LOGS_KEY) || '';
}

// Flushes this realm's in-memory buffer to storage and returns the full
// accumulated log string. Exposed on `window` so a popout can delegate the
// entire flush+read to its opener's realm in one call.
export function flushAndGetLogs(): string {
    flushLogsToAccumulated();
    return getClientLogs();
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
