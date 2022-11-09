import React from 'react';
import ReactDOM from 'react-dom';

import {
    sendDesktopEvent,
    playSound,
} from 'plugin/utils';

import {
    logDebug,
    logErr,
} from 'plugin/log';

import CallWidget from 'plugin/components/call_widget';

import init from './init';

init('widget', (store, theme) => {
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
}, () => {
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
});
