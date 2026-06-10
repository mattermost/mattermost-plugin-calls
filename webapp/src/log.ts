// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/* eslint-disable no-console */

import {STORAGE_CALLS_CLIENT_LOGS_KEY} from 'src/constants';
import {getPersistentStorage} from 'src/utils';

import {pluginId} from './manifest';

let clientLogs = '';

function stringifyLogArg(arg: unknown): string {
    if (typeof arg === 'string') {
        return arg;
    }
    if (arg instanceof Error) {
        return arg.stack || `${arg.name}: ${arg.message}`;
    }
    try {
        return JSON.stringify(arg) ?? String(arg);
    } catch {
        return String(arg);
    }
}

function appendClientLog(level: string, ...args: unknown[]) {
    const serialized = args.map(stringifyLogArg).join(' ');
    clientLogs += `${level} [${new Date().toISOString()}] ${serialized}\n`;
}

export function persistClientLogs() {
    getPersistentStorage().setItem(STORAGE_CALLS_CLIENT_LOGS_KEY, clientLogs);
    clientLogs = '';
}

export function getClientLogs() {
    return getPersistentStorage().getItem(STORAGE_CALLS_CLIENT_LOGS_KEY) || '';
}

export function logErr(...args: unknown[]) {
    console.error(`${pluginId}:`, ...args);
    try {
        if (window.callsClient) {
            appendClientLog('error', ...args);
        }
    } catch (err) {
        console.error(err);
    }
}

export function logWarn(...args: unknown[]) {
    console.warn(`${pluginId}:`, ...args);
    if (window.callsClient) {
        appendClientLog('warn', ...args);
    }
}

export function logInfo(...args: unknown[]) {
    console.info(`${pluginId}:`, ...args);
    if (window.callsClient) {
        appendClientLog('info', ...args);
    }
}

export function logDebug(...args: unknown[]) {
    console.debug(`${pluginId}:`, ...args);
    if (window.callsClient) {
        appendClientLog('debug', ...args);
    }
}
