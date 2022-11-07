import React from 'react';
import ReactDOM from 'react-dom';

import {Store} from 'plugin/types/mattermost-webapp';
import {Theme} from 'mattermost-redux/types/themes';

import {getTeam as getTeamAction, getMyTeams, selectTeam} from 'mattermost-redux/actions/teams';
import {getChannel as getChannelAction, getChannelMembers} from 'mattermost-redux/actions/channels';
import {getChannel} from 'mattermost-redux/selectors/entities/channels';

import {getTeam, getTeams} from 'mattermost-redux/selectors/entities/teams';
import {isDirectChannel, isGroupChannel, isOpenChannel, isPrivateChannel} from 'mattermost-redux/utils/channel_utils';

import {
    sendDesktopEvent,
    playSound,
} from 'plugin/utils';

import {
    logDebug,
    logErr,
} from 'plugin/log';

import CallWidget from 'plugin/components/call_widget';

import init from '../init';

function initWidget(store: Store, theme: Theme) {
    window.addEventListener('message', (ev: MessageEvent) => {
        if (ev.origin !== window.origin) {
            return;
        }
        switch (ev.data?.type) {
        case 'register-desktop':
            window.desktop = ev.data.message;
            break;
        case 'calls-widget-share-screen':
            window.callsClient?.shareScreen(ev.data.message.sourceID, ev.data.message.withAudio);
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
        ReactDOM.unmountComponentAtNode(document.getElementById('root')!);
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
