import {GlobalState} from '@mattermost/types/store';
import {NotificationLevel} from 'mattermost-redux/constants/channels';
import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentUser} from 'mattermost-redux/selectors/entities/users';
import {useEffect} from 'react';
import {useDispatch, useSelector, useStore} from 'react-redux';

import {DID_RING_FOR_CALL} from 'src/action_types';
import {dismissIncomingCallNotification, showSwitchCallModal} from 'src/actions';
import {DEFAULT_RING_SOUND, RING_LENGTH} from 'src/constants';
import {logDebug} from 'src/log';
import {connectedChannelID, didRingForCall} from 'src/selectors';
import {IncomingCallNotification} from 'src/types/types';
import {desktopGTE, getChannelURL, sendDesktopEvent, shouldRenderDesktopWidget} from 'src/utils';
import {notificationSounds} from 'src/webapp_globals';

export const useDismissJoin = (channelID: string, callID: string, global = false) => {
    const store = useStore();
    const dispatch = useDispatch();
    const connectedID = useSelector(connectedChannelID) || '';

    const onDismiss = () => {
        dispatch(dismissIncomingCallNotification(channelID, callID));
    };

    const onJoin = () => {
        dispatch(dismissIncomingCallNotification(channelID, callID));

        if (connectedID) {
            if (global && desktopGTE(5, 5)) {
                logDebug('sending calls-join-request message to desktop app');
                sendDesktopEvent('calls-join-request', {
                    callID: channelID,
                });
                return;
            }
            if (global) {
                logDebug('sending calls-widget-channel-link-click and calls-joined-call message to desktop app');
                const currentChannel = getChannel(store.getState(), connectedID);
                const channelURL = getChannelURL(store.getState(), currentChannel, currentChannel.team_id);
                sendDesktopEvent('calls-widget-channel-link-click', {pathName: channelURL});
                sendDesktopEvent('calls-joined-call', {
                    type: 'calls-join-request',
                    callID: channelID,
                });
                return;
            }

            dispatch(showSwitchCallModal(channelID));
            return;
        }
        window.postMessage({type: 'connectCall', channelID}, window.origin);
    };

    return [onDismiss, onJoin];
};

export const useOnACallWithoutGlobalWidget = () => {
    const connectedChannel = useSelector(connectedChannelID);
    return Boolean(connectedChannel && !shouldRenderDesktopWidget());
};

export const useRinging = (call: IncomingCallNotification, onWidget: boolean) => {
    const dispatch = useDispatch();
    const currentUser = useSelector(getCurrentUser);
    const didRing = useSelector((state: GlobalState) => didRingForCall(state, call.callID));

    useEffect(() => {
        const stopRinging = () => {
            notificationSounds?.stopRing();
            dispatch({
                type: DID_RING_FOR_CALL,
                data: {
                    callID: call.callID,
                },
            });
        };

        // If we're on the widget, that means we're on a call. If we're also on desktopWidget then
        // don't ring because the ringing will be handled by the main webapp.
        const ringHandledByWebapp = onWidget && shouldRenderDesktopWidget();

        // @ts-ignore Our mattermost import is old and at the moment un-updatable.
        if (!call.ring || ringHandledByWebapp || didRing || currentUser.notify_props.desktop === NotificationLevel.NONE || currentUser.notify_props.calls_desktop_sound === 'false') {
            return;
        }

        // @ts-ignore
        notificationSounds?.ring(currentUser.notify_props.calls_notification_sound || DEFAULT_RING_SOUND);
        const timer = setTimeout(() => stopRinging(), RING_LENGTH);

        // eslint-disable-next-line consistent-return
        return () => {
            clearTimeout(timer);
            stopRinging();
        };
    }, [call, didRing, onWidget, currentUser.notify_props, dispatch]);
};
