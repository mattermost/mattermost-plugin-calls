// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

export const WEBSOCKET_EVENT = {
    OPEN: 'open',
    CLOSE: 'close',
    ERROR: 'error',
    MESSAGE: 'message',
    JOIN: 'join',
    RECONNECT: 'reconnect',
    LEAVE: 'leave',
} as const;