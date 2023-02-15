import React from 'react';
import ReactDOM from 'react-dom';

import {Store} from 'plugin/types/mattermost-webapp';
import {Theme} from 'mattermost-redux/types/themes';

import {getTeam as getTeamAction, selectTeam} from 'mattermost-redux/actions/teams';
import {getChannel as getChannelAction, getChannelMembers} from 'mattermost-redux/actions/channels';
import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';

import {getTeams} from 'mattermost-redux/selectors/entities/teams';
import {isOpenChannel, isPrivateChannel} from 'mattermost-redux/utils/channel_utils';

import {
    sendDesktopEvent,
    playSound,
} from 'plugin/utils';

import {
    logDebug,
} from 'plugin/log';

import {
    VOICE_CHANNEL_USER_CONNECTED,
} from 'plugin/action_types';

import CallWidget from 'plugin/components/call_widget';

import init from '../init';

async function initWidget(store: Store, theme: Theme, channelID: string) {
    store.dispatch({
        type: VOICE_CHANNEL_USER_CONNECTED,
        data: {
            channelID,
            userID: getCurrentUserId(store.getState()),
            currentUserID: getCurrentUserId(store.getState()),
        },
    });

    window.addEventListener('message', (ev: MessageEvent) => {
        if (ev.origin !== window.origin) {
            return;
        }
        switch (ev.data?.type) {
        case 'register-desktop':
            window.desktop = ev.data.message;
            break;
        }
    });
    sendDesktopEvent('get-app-version');

    ReactDOM.render(
        <CallWidget
            store={store}
            theme={theme}
            global={true}
            position={{bottom: 2, left: 2}}
        />,
        document.getElementById('root'),
    );
}

async function initStoreWidget(store: Store, channelID: string) {
    await store.dispatch(getChannelAction(channelID));

    const channel = getChannel(store.getState(), channelID);
    if (!channel) {
        return;
    }

    if (isOpenChannel(channel) || isPrivateChannel(channel)) {
        await getTeamAction(channel.team_id)(store.dispatch, store.getState);
    } else {
        await getChannelMembers(channel.id)(store.dispatch, store.getState);
        const teams = getTeams(store.getState());
        await selectTeam(Object.values(teams)[0])(store.dispatch, store.getState);
    }
}

function deinitWidget() {
    playSound('leave_self');

    // Using setTimeout to give the app enough time to play the sound before
    // closing the widget window.
    setTimeout(() => {
        window.callsClient?.destroy();
        delete window.callsClient;
        const el = document.getElementById('root');
        if (el) {
            ReactDOM.unmountComponentAtNode(el);
        }
        logDebug('sending leave call message to desktop app');
        sendDesktopEvent('calls-leave-call');
    }, 200);
}

init({
    name: 'widget',
    initCb: initWidget,
    initStore: initStoreWidget,
    closeCb: deinitWidget,
});
