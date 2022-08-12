import React from 'react';
import ReactDOM from 'react-dom';

import {Client4} from 'mattermost-redux/client';
import configureStore from 'mattermost-redux/store';
import {getChannel as getChannelAction} from 'mattermost-redux/actions/channels';
import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';
import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getTheme} from 'mattermost-redux/selectors/entities/preferences';
import {getConfig} from 'mattermost-redux/selectors/entities/general';

import {pluginId} from 'plugin/manifest';
import CallWidget from 'plugin/components/call_widget';
import CallsClient from 'plugin/client';
import reducer from 'plugin/reducers';
import {
    VOICE_CHANNEL_USER_CONNECTED,
} from 'plugin/action_types';

import {
    getWSConnectionURL,
} from 'plugin/utils';

function getCallID() {
    const params = new URLSearchParams(window.location.search);
    return params.get('call_id');
}

function connectCall(channelID: string, wsURL: string) {
    try {
        if (window.callsClient) {
            console.error('calls client is already initialized');
            return;
        }

        window.callsClient = new CallsClient({
            wsURL,

            // iceServers: iceConfigs,
        });

        window.callsClient.on('close', () => {
            if (window.callsClient) {
                window.callsClient.destroy();
                delete window.callsClient;

                // playSound(getPluginStaticPath() + LeaveSelfSound);
            }
        });

        window.callsClient.init(channelID).catch((err: Error) => {
            delete window.callsClient;
            console.error(err);
        });
    } catch (err) {
        delete window.callsClient;
        console.error(err);
    }
}

async function init() {
    const storeKey = `plugins-${pluginId}`;
    const store = configureStore({
        appReducers: {
            [storeKey]: reducer,
        },
    });

    console.log(pluginId);
    console.log(store);
    console.log(store.getState());
    console.log('init');

    const theme = getTheme(store.getState());

    console.log(theme);

    const channelID = getCallID();
    console.log(channelID);

    if (!channelID) {
        console.error('invalid call id');
        return;
    }

    let channel = getChannel(store.getState(), channelID);
    if (!channel) {
        await getChannelAction(channelID)(store.dispatch, store.getState);
        channel = getChannel(store.getState(), channelID);
    }

    if (!channel) {
        console.error('channel not found');
        return;
    }

    console.log(channel);

    connectCall(channel.id, getWSConnectionURL(getConfig(store.getState())));

    await store.dispatch({
        type: VOICE_CHANNEL_USER_CONNECTED,
        data: {
            channelID: channel.id,
            userID: getCurrentUserId(store.getState()),
            currentUserID: getCurrentUserId(store.getState()),
        },
    });

    ReactDOM.render(
        <CallWidget
            store={store}
            theme={theme}
            channel={channel}
        />,
        document.getElementById('root'),
    );
}

init();
