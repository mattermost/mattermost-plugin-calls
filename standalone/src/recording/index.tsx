import {CallState, CallStateData, JobStopData, UserJoinedData, WebsocketEventData} from '@mattermost/calls-common/lib/types';
import {WebSocketMessage} from '@mattermost/client/websocket';
import {ChannelTypes} from 'mattermost-redux/action_types';
import {getCurrentUserLocale} from 'mattermost-redux/selectors/entities/i18n';
import {logErr, logInfo} from 'plugin/log';
import {pluginId} from 'plugin/manifest';
import {Store} from 'plugin/types/mattermost-webapp';
import {
    fetchTranslationsFile,
    getPluginPath,
    getUserIDsForSessions,
    runWithRetry,
    setCallsGlobalCSSVars,
} from 'plugin/utils';
import React from 'react';
import ReactDOM from 'react-dom';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import {getJobID} from 'src/common';
import recordingReducer from 'src/recording/reducers';
import RestClient from 'src/rest_client';

import init, {InitCbProps} from '../init';
import {
    RECEIVED_CALL_PROFILE_IMAGES,
} from './action_types';
import RecordingView from './components/recording_view';

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
    let messages;
    if (locale !== 'en') {
        try {
            messages = await runWithRetry(() => fetchTranslationsFile(locale));
        } catch (err) {
            logErr('failed to fetch translations files', err);
        }
    }

    ReactDOM.render(
        <Provider store={store}>
            <IntlProvider
                locale={locale}
                key={locale}
                defaultLocale='en'
                messages={messages}
            >
                <RecordingView/>
            </IntlProvider>
        </Provider>,
        document.getElementById('root'),
    );
}

function wsHandlerRecording(store: Store, ev: WebSocketMessage<WebsocketEventData>) {
    switch (ev.event) {
    case `custom_${pluginId}_user_joined`: {
        const data = ev.data as UserJoinedData;

        runWithRetry(() => {
            return fetchProfileImages([data.user_id]);
        }).then((images) => {
            store.dispatch({
                type: RECEIVED_CALL_PROFILE_IMAGES,
                data: {
                    channelID: data.channelID,
                    profileImages: images,
                },
            });
        }).catch((err) => {
            logErr('failed to fetch user profiles', err);
        });

        break;
    }
    case `custom_${pluginId}_call_state`: {
        const data = ev.data as CallStateData;
        const call: CallState = JSON.parse(data.call);

        if (call.sessions?.length > 0) {
            runWithRetry(() => {
                return fetchProfileImages(getUserIDsForSessions(call.sessions));
            }).then((images) => {
                store.dispatch({
                    type: RECEIVED_CALL_PROFILE_IMAGES,
                    data: {
                        channelID: data.channel_id,
                        profileImages: images,
                    },
                });
            }).catch((err) => {
                logErr('failed to fetch profile images', err);
            });
        }

        break;
    }
    case `custom_${pluginId}_job_stop`: {
        const data = ev.data as JobStopData;

        if (getJobID() === data.job_id) {
            logInfo('received job stop event, disconnecting');
            window.callsClient?.disconnect();
        }

        break;
    }
    default:
        break;
    }
}

function deinitRecording() {
    window.callsClient?.destroy();
    delete window.callsClient;
}

runWithRetry(() => init({
    name: 'recording',
    reducer: recordingReducer,
    initStore: initRecordingStore,
    initCb: initRecording,
    wsHandler: wsHandlerRecording,
    closeCb: deinitRecording,
}));
