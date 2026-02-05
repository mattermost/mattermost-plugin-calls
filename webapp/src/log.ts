// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/* eslint-disable no-console */

import {MAX_ACCUMULATED_LOG_SIZE, STORAGE_CALLS_CLIENT_LOGS_KEY} from 'src/constants';
import type {CallsClientStats} from 'src/types/types';
import {getPersistentStorage} from 'src/utils';

import {pluginId} from './manifest';

let clientLogs = '';

function appendClientLog(level: string, ...args: unknown[]) {
    clientLogs += `${level} [${new Date().toISOString()}] ${args}\n`;
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

// Start periodic cleanup of in-memory logs when not in a call
export function startPeriodicLogCleanup() {
    // Clear accumulated background noise once per day if not in a call
    setInterval(() => {
        if (!window.callsClient) {
            clientLogs = '';
        }
    }, 24 * 60 * 60 * 1000); // 24 hours
}
