// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

export const WEBSOCKET_EVENT = {
    OPEN: 'open',
    CLOSE: 'close',
    ERROR: 'error',
    MESSAGE: 'message',
    EVENT: 'event',
    JOIN: 'join',
    RECONNECT: 'reconnect',
    LEAVE: 'leave',
} as const;

export const wsMinReconnectRetryTimeMs = 1000; // 1 second
export const wsReconnectionTimeout = 30000; // 30 seconds
export const wsReconnectTimeIncrement = 500; // 0.5 seconds
export const wsPingIntervalMs = 5000; // 5 seconds
