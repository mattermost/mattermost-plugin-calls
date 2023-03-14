import React from 'react';
import ReactDOM from 'react-dom';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';

import {Store} from 'plugin/types/mattermost-webapp';
import {Theme} from 'mattermost-redux/types/themes';
import {UserProfile} from '@mattermost/types/users';
import {Client4} from 'mattermost-redux/client';
import {ChannelTypes} from 'mattermost-redux/action_types';
import {getCurrentUserId} from 'mattermost-webapp/packages/mattermost-redux/src/selectors/entities/users';
import {getCurrentUserLocale} from 'mattermost-redux/selectors/entities/i18n';

import {WebSocketMessage} from '@mattermost/types/websocket';

import {UserConnectedData, WebsocketEventData} from '@calls/common/lib/types';

import {getProfilesByIds, getPluginPath, fetchTranslationsFile} from 'plugin/utils';
import {logErr} from 'plugin/log';
import {pluginId} from 'plugin/manifest';
import {voiceConnectedProfilesInChannel} from 'plugin/selectors';
import {VOICE_CHANNEL_USER_CONNECTED} from 'src/action_types';

import recordingReducer from 'src/recording/reducers';

import init from '../init';

import RecordingView from './components/recording_view';

import {
    RECEIVED_CALL_PROFILE_IMAGES,
} from './action_types';

async function fetchProfileImages(profiles: UserProfile[]) {
    const profileImages: {[userID: string]: string} = {};
    const promises = [];
    for (const profile of profiles) {
        promises.push(
            fetch(`${getPluginPath()}/bot/users/${profile.id}/image`,
                Client4.getOptions({method: 'get'})).then((res) => {
                if (!res.ok) {
                    throw new Error('fetch failed');
                }
                return res.blob();
            }).then((data) => {
                profileImages[profile.id] = URL.createObjectURL(data);
            }).catch((err) => {
                logErr(err);
            }));
    }
    await Promise.all(promises);
    return profileImages;
}

async function initRecordingStore(store: Store, channelID: string) {
    const channel = await Client4.doFetch(
        `${getPluginPath()}/bot/channels/${channelID}`,
        {method: 'get'},
    );

    store.dispatch(
        {
            type: ChannelTypes.RECEIVED_CHANNEL,
            data: channel,
        },
    );
}

async function initRecording(store: Store, theme: Theme, channelID: string) {
    await store.dispatch({
        type: VOICE_CHANNEL_USER_CONNECTED,
        data: {
            channelID,
            userID: getCurrentUserId(store.getState()),
            currentUserID: getCurrentUserId(store.getState()),
        },
    });

    const profiles = voiceConnectedProfilesInChannel(store.getState(), channelID);

    if (profiles?.length > 0) {
        store.dispatch({
            type: RECEIVED_CALL_PROFILE_IMAGES,
            data: {
                channelID,
                profileImages: await fetchProfileImages(profiles),
            },
        });
    }

    const locale = getCurrentUserLocale(store.getState()) || 'en';
    let messages;
    if (locale !== 'en') {
        try {
            messages = await fetchTranslationsFile(locale);
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
        const profiles = await getProfilesByIds(store.getState(), [(ev.data as UserConnectedData).userID]);
        store.dispatch({
            type: RECEIVED_CALL_PROFILE_IMAGES,
            data: {
                channelID: ev.broadcast.channel_id,
                profileImages: await fetchProfileImages(profiles),
            },
        });
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

init({
    name: 'recording',
    reducer: recordingReducer,
    initStore: initRecordingStore,
    initCb: initRecording,
    wsHandler: wsHandlerRecording,
    closeCb: deinitRecording,
});
