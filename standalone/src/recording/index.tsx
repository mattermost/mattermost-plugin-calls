// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {CallState} from '@mattermost/calls-common/lib/types';
import {ChannelTypes} from 'mattermost-redux/action_types';
import {getCurrentUserLocale} from 'mattermost-redux/selectors/entities/i18n';
import CallClient, {CALL_EVENT} from 'plugin/clients/call';
import {logErr} from 'plugin/log';
import {Store} from 'plugin/types/mattermost-webapp';
import {
    getPluginPath,
    getTranslations,
    getUserIDsForSessions,
    runWithRetry,
    setCallsGlobalCSSVars,
} from 'plugin/utils';
import React from 'react';
import {createRoot, Root} from 'react-dom/client';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import RestClient from 'src/clients/rest';
import recordingReducer from 'src/recording/reducers';

import initialiseEmbedApp, {InitCbProps} from '../index';
import {
    RECEIVED_CALL_PROFILE_IMAGES,
} from './action_types';
import RecordingView from './components/recording_view';

let recordingRoot: Root | null = null;

async function fetchProfileImages(ids: string[]) {
    const profileImages: {[userID: string]: string} = {};
    const promises = [];
    for (const id of ids) {
        promises.push(
            runWithRetry(() => {
                return fetch(`${getPluginPath()}/bot/users/${id}/image`, RestClient.getOptions({method: 'get'})).then((res) => {
                    if (!res.ok) {
                        throw new Error('image fetch failed');
                    }
                    return res.blob();
                }).then((data) => {
                    profileImages[id] = URL.createObjectURL(data);
                });
            }),
        );
    }

    try {
        await Promise.all(promises);
    } catch (err) {
        logErr('failed to load profile images', err);
    }

    return profileImages;
}

async function initRecordingStore(store: Store, channelID: string) {
    try {
        const channel = await runWithRetry(() => {
            return RestClient.fetch(`${getPluginPath()}/bot/channels/${channelID}`, {method: 'get'});
        });

        store.dispatch(
            {
                type: ChannelTypes.RECEIVED_CHANNEL,
                data: channel,
            },
        );
    } catch (err) {
        logErr('failed to fetch channel', err);
    }
}

async function initRecording({store, theme}: InitCbProps) {
    setCallsGlobalCSSVars(theme.sidebarBg);

    const locale = getCurrentUserLocale(store.getState()) || 'en';

    const rootEl = document.getElementById('root');
    if (rootEl) {
        recordingRoot ??= createRoot(rootEl);
        recordingRoot.render(
            <Provider store={store}>
                <IntlProvider
                    locale={locale}
                    key={locale}
                    defaultLocale='en'
                    messages={getTranslations(locale)}
                >
                    <RecordingView/>
                </IntlProvider>
            </Provider>,
        );
    }
}

// loadProfileImages fetches avatars for the given users into the recording
// store, which renders participant tiles.
function loadProfileImages(store: Store, channelID: string, userIDs: string[]) {
    if (userIDs.length === 0) {
        return;
    }

    runWithRetry(() => {
        return fetchProfileImages(userIDs);
    }).then((images) => {
        store.dispatch({
            type: RECEIVED_CALL_PROFILE_IMAGES,
            data: {
                channelID,
                profileImages: images,
            },
        });
    }).catch((err) => {
        logErr('failed to fetch profile images', err);
    });
}

// Avatars used to be fetched off plugin WebSocket events. They now hang off the
// same two sources everything else does: the join response snapshot for whoever
// is already in the call, and LiveKit participant events for later joiners.
//
// The job_stop event is gone with the WebSocket and has no replacement here: the
// server evicts the bot from the LiveKit room instead, which surfaces as a
// normal disconnect and runs deinitRecording.
function callEventHandlerRecording(store: Store, callClient: CallClient) {
    callClient.on(CALL_EVENT.CALL_STATE, (call: CallState) => {
        if (call.sessions?.length > 0) {
            loadProfileImages(store, callClient.channelID, getUserIDsForSessions(call.sessions));
        }
    });

    callClient.on(CALL_EVENT.USER_JOINED, (_sessionID: string, userID: string) => {
        loadProfileImages(store, callClient.channelID, [userID]);
    });
}

function deinitRecording() {
    recordingRoot?.unmount();
    recordingRoot = null;
    delete window.callsClient;
}

runWithRetry(() => initialiseEmbedApp({
    name: 'recording',
    reducer: recordingReducer,
    initStore: initRecordingStore,
    initCb: initRecording,
    callEventHandler: callEventHandlerRecording,
    closeCb: deinitRecording,
}));
