import {getChannel as getChannelAction, getChannelMembers} from 'mattermost-redux/actions/channels';
import {getMyPreferences} from 'mattermost-redux/actions/preferences';
import {getMyTeamMembers, getMyTeams, getTeam as getTeamAction, selectTeam} from 'mattermost-redux/actions/teams';
import {getMe} from 'mattermost-redux/actions/users';
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
    fetchTranslationsFile,
    playSound, sendDesktopError,
    sendDesktopEvent,
} from 'plugin/utils';
import React from 'react';
import ReactDOM from 'react-dom';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';

import init, {InitCbProps} from '../init';

async function initWidget({store, startingCall}: InitCbProps) {
    if (window.desktopAPI?.getAppInfo) {
        logDebug('desktopAPI.getAppInfo');
        window.desktop = await window.desktopAPI.getAppInfo();
    } else {
        // DEPRECATED: legacy Desktop API logic (<= 5.6.0)
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

        // DEPRECATED: legacy Desktop API logic (<= 5.6.0)
        sendDesktopEvent('get-app-version');
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
                <CallWidget
                    global={true}
                    startingCall={startingCall}
                    position={{bottom: 4, left: 2}}
                />
            </IntlProvider>
        </Provider>,
        document.getElementById('root'),
    );
}

async function initStoreWidget(store: Store, channelID: string) {
    // initialize some basic state.
    await Promise.all([
        store.dispatch(getMe()),
        store.dispatch(getMyPreferences()),
        store.dispatch(getMyTeams()),
        store.dispatch(getMyTeamMembers()),
        store.dispatch(getChannelAction(channelID)),
    ]);

    const channel = getChannel(store.getState(), channelID);
    if (!channel) {
        return;
    }

    if (isOpenChannel(channel) || isPrivateChannel(channel)) {
        await store.dispatch(getTeamAction(channel.team_id));
    } else {
        await store.dispatch(getChannelMembers(channel.id));
        const teams = getTeams(store.getState());
        store.dispatch(selectTeam(Object.values(teams)[0]));
    }
}

function deinitWidget(err?: Error) {
    playSound('leave_self');

    if (err) {
        sendDesktopError(window.callsClient?.channelID, err.message);
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

        if (window.desktopAPI?.leaveCall) {
            logDebug('desktopAPI.leaveCall');
            window.desktopAPI.leaveCall();
        } else {
            logDebug('sending leave call message to desktop app');

            // DEPRECATED: legacy Desktop API logic (<= 5.6.0)
            sendDesktopEvent('calls-leave-call');
        }
    }, 250);
}

init({
    name: 'widget',
    initCb: initWidget,
    initStore: initStoreWidget,
    closeCb: deinitWidget,
});
