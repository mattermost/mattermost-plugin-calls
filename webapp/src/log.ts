/* eslint-disable no-console */

import {STORAGE_CALLS_CLIENT_LOGS_KEY} from 'src/constants';
import {getPersistentStorage} from 'src/utils';

import {pluginId} from './manifest';

let clientLogs = '';

function appendClientLog(level: string, ...args: unknown[]) {
    clientLogs += `${level} [${new Date().toISOString()}] ${args}\n`;
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
