import {
    DESKTOP_WIDGET_CONNECTED,
} from 'src/action_types';
import {
    showSwitchCallModal,
} from 'src/actions';
import {logDebug} from 'src/log';
import {
    CallsDesktopJoinResponse,
} from 'src/types/types';
import {
    desktopGTE,
} from 'src/utils';

import {Store} from './types/mattermost-webapp';

export function handleDesktopJoinedCall(store: Store, msg: CallsDesktopJoinResponse) {
    logDebug('handleDesktopJoinedCall');

    if (!desktopGTE(5, 5) && msg.type === 'calls-join-request') {
        // This `calls-joined-call` message has been repurposed as a `calls-join-request` message
        // because the current desktop version (< 5.5) does not have a dedicated `calls-join-request` message.
        store.dispatch(showSwitchCallModal(msg.callID));
        return;
    }

    store.dispatch({
        type: DESKTOP_WIDGET_CONNECTED,
        data: {
            channel_id: msg.callID,
            session_id: msg.sessionID,
        },
    });
}
