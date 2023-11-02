import {getChannel as getChannelAction, getChannelMembers} from 'mattermost-redux/actions/channels';
import {getTeam as getTeamAction, selectTeam} from 'mattermost-redux/actions/teams';
import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentUserLocale} from 'mattermost-redux/selectors/entities/i18n';
import {getTeams} from 'mattermost-redux/selectors/entities/teams';
import {isOpenChannel, isPrivateChannel} from 'mattermost-redux/utils/channel_utils';
import CallWidget from 'plugin/components/call_widget';
import {
    logDebug,
    logErr,
} from 'plugin/log';
import {Store} from 'plugin/types/mattermost-webapp';
import {
    sendDesktopEvent,
    playSound,
    fetchTranslationsFile,
} from 'plugin/utils';
import React from 'react';
import ReactDOM from 'react-dom';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';

import init from '../init';

async function initWidget(store: Store) {
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
                <CallWidget
                    global={true}
                    position={{bottom: 4, left: 2}}
                />
            </IntlProvider>
        </Provider>,
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
        store.dispatch(selectTeam(Object.values(teams)[0]));
    }
}

function deinitWidget(err?: Error) {
    playSound('leave_self');

    if (err) {
        sendDesktopEvent('calls-error', {
            err: 'client-error',
            callID: window.callsClient?.channelID,
            errMsg: err.message,
        });
    }

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
    }, 250);
}

init({
    name: 'widget',
    initCb: initWidget,
    initStore: initStoreWidget,
    closeCb: deinitWidget,
});
