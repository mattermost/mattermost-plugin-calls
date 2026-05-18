// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {WebSocketErrorType} from './types';

export class WebSocketError extends Error {
    public type: WebSocketErrorType;

    constructor(type: WebSocketErrorType, message: string) {
        super(message);

        this.type = type;

        // needed since we are extending a built-in class
        Object.setPrototypeOf(this, WebSocketError.prototype);
    }
}