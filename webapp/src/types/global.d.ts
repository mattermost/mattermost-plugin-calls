// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type WebSocketClient from '@mattermost/client/websocket';
import type {DesktopAPI} from '@mattermost/desktop-api';
import type {ActionFuncAsync} from 'mattermost-redux/types/actions';
import type CallClient from 'src/clients/call';
import type {DesktopNotificationArgs, WebAppUtils} from 'src/types/mattermost-webapp';
import type {CallActions, CurrentCallData} from 'src/types/types';

declare global {
    interface Window {
        callsClient?: CallClient,

        // Appends a pre-formatted log line to this realm's in-memory client-log
        // buffer. Exposed so the expanded-view popout can write through to its
        // opener's buffer (single source of truth). See src/log.ts.
        callsClientLogAppend?: (line: string) => void,
        webkitAudioContext: AudioContext,
        basename: string,
        desktop?: {
            version?: string | null;
        },
        desktopAPI?: DesktopAPI;
        screenSharingTrackId: string,
        currentCallData?: CurrentCallData,
        callActions?: CallActions,
        WebappUtils: WebAppUtils,
        ProductApi: {
            useWebSocketClient: () => WebSocketClient,
            WebSocketProvider: React.Context<WebSocketClient>,
            selectRhsPost: (postId: string) => ActionFuncAsync,
        };

        e2eDesktopNotificationsRejected?: DesktopNotificationArgs[],
        e2eDesktopNotificationsSent?: string[],
        e2eNotificationsSoundedAt?: number[],
        e2eNotificationsSoundStoppedAt?: number[],
        e2eRingLength?: number,
        e2eCallStateLoaded?: (channelID?: string) => boolean,

        registerPlugin(id: string, plugin: unknown): void,
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
}
