// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type WebSocketClient from '@mattermost/client/websocket';
import type {DesktopAPI} from '@mattermost/desktop-api';
import type {ActionFuncAsync} from 'mattermost-redux/types/actions';
import type CallClient from 'src/clients/call';
import type {DesktopNotificationArgs, WebAppUtils} from 'src/types/mattermost-webapp';
import type {CallActions, CurrentCallData} from 'src/types/types';

import type Plugin from '../index';

declare global {
    interface Window {
        registerPlugin(id: string, plugin: Plugin): void,

        callsClient?: CallClient,
        webkitAudioContext: AudioContext,
        basename: string,

        desktop?: {
            version?: string | null;
        },
        desktopAPI?: DesktopAPI;
        screenSharingTrackId: string,
        currentCallData?: CurrentCallData,
        callActions?: CallActions,
        e2eDesktopNotificationsRejected?: DesktopNotificationArgs[],
        e2eDesktopNotificationsSent?: string[],
        e2eNotificationsSoundedAt?: number[],
        e2eNotificationsSoundStoppedAt?: number[],
        e2eRingLength?: number,
        WebappUtils: WebAppUtils,

        ProductApi: {
            useWebSocketClient: () => WebSocketClient,
            WebSocketProvider: React.Context<WebSocketClient>,
            selectRhsPost: (postId: string) => ActionFuncAsync,
        };
    }

    interface HTMLVideoElement {
        webkitRequestFullscreen: () => void,
        msRequestFullscreen: () => void,
        mozRequestFullscreen: () => void,
    }

    interface CanvasRenderingContext2D {
        webkitBackingStorePixelRatio: number,
        mozBackingStorePixelRatio: number,
        msBackingStorePixelRatio: number,
        oBackingStorePixelRatio: number,
        backingStorePixelRatio: number,
    }

    // fix for a type problem in webapp as of 6dcac2
    type DeepPartial<T> = {
        [P in keyof T]?: DeepPartial<T[P]>;
    }
}
