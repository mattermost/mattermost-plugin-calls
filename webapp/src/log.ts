/* eslint-disable no-console */

import {pluginId} from './manifest';

export function logErr(...args: any[]) {
    console.error(`${pluginId}:`, ...args);
}

export function logWarn(...args: any[]) {
    console.warn(`${pluginId}:`, ...args);
}

export function logInfo(...args: any[]) {
    console.info(`${pluginId}:`, ...args);
}

export function logDebug(...args: any[]) {
    // TODO: convert to debug once we are out of beta.
    console.info(`${pluginId}:`, ...args);
}
