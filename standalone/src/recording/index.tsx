import {UserConnectedData, WebsocketEventData, CallStateData} from '@calls/common/lib/types';
import {WebSocketMessage} from '@mattermost/client/websocket';
import {UserProfile} from '@mattermost/types/users';
import {ChannelTypes} from 'mattermost-redux/action_types';
import {getCurrentUserLocale} from 'mattermost-redux/selectors/entities/i18n';
import {Theme} from 'mattermost-redux/selectors/entities/preferences';
import {logErr} from 'plugin/log';
import {pluginId} from 'plugin/manifest';
import {profilesInCallInChannel} from 'plugin/selectors';
import {Store} from 'plugin/types/mattermost-webapp';
import {getProfilesByIds, getPluginPath, fetchTranslationsFile, setCallsGlobalCSSVars, runWithRetry} from 'plugin/utils';
import React from 'react';
import ReactDOM from 'react-dom';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import RestClient from 'src/rest_client';

import init from '../init';
import recordingReducer from 'src/recording/reducers';

import {
    RECEIVED_CALL_PROFILE_IMAGES,
} from './action_types';
import RecordingView from './components/recording_view';

async function fetchProfileImages(profiles: UserProfile[]) {
    const profileImages: {[userID: string]: string} = {};
    const promises = [];
    for (const profile of profiles) {
        promises.push(
            runWithRetry(() => {
                return fetch(`${getPluginPath()}/bot/users/${profile.id}/image`, RestClient.getOptions({method: 'get'})).then((res) => {
                    if (!res.ok) {
                        throw new Error('image fetch failed');
                    }
                    return res.blob();
                }).then((data) => {
                    profileImages[profile.id] = URL.createObjectURL(data);
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

async function initRecording(store: Store, theme: Theme) {
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

async function wsHandlerRecording(store: Store, ev: WebSocketMessage<WebsocketEventData>) {
    switch (ev.event) {
    case `custom_${pluginId}_user_connected`: {
        const data = ev.data as UserConnectedData;

        try {
            const profiles = await runWithRetry(() => getProfilesByIds(store.getState(), [data.userID]));
            store.dispatch({
                type: RECEIVED_CALL_PROFILE_IMAGES,
                data: {
                    channelID: data.channelID,
                    profileImages: await fetchProfileImages(profiles),
                },
            });
        } catch (err) {
            logErr('failed to fetch user profiles', err);
        }

        break;
    }
    case `custom_${pluginId}_call_state`: {
        const data = ev.data as CallStateData;

        const profiles = profilesInCallInChannel(store.getState(), data.channel_id);

        if (profiles?.length > 0) {
            store.dispatch({
                type: RECEIVED_CALL_PROFILE_IMAGES,
                data: {
                    channelID: data.channel_id,
                    profileImages: await fetchProfileImages(profiles),
                },
            });
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
