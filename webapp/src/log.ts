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

function appendClientLog(level: string, ...args: unknown[]) {
    const serialized = args.map(stringifyLogArg).join(' ');
    clientLogs += `${level} [${new Date().toISOString()}] ${serialized}\n`;
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
