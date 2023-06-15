import {GlobalState} from '@mattermost/types/store';
import {NotificationLevel} from 'mattermost-redux/constants/channels';
import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentUser} from 'mattermost-redux/selectors/entities/users';
import {useEffect} from 'react';
import {useDispatch, useSelector, useStore} from 'react-redux';

import {DID_RING_FOR_CALL, REMOVE_INCOMING_CALL} from 'src/action_types';
import {dismissIncomingCallNotification, showSwitchCallModal} from 'src/actions';
import {RING_LENGTH} from 'src/constants';
import {logDebug} from 'src/log';
import {connectedChannelID, didRingForCall} from 'src/selectors';
import {IncomingCallNotification} from 'src/types/types';
import {desktopGTE, getChannelURL, sendDesktopEvent, shouldRenderDesktopWidget} from 'src/utils';
import {notificationSounds} from 'src/webapp_globals';

export const useDismissJoin = (callID: string, startAt: number, global = false) => {
    const store = useStore();
    const dispatch = useDispatch();
    const connectedID = useSelector(connectedChannelID) || '';

    const onDismiss = () => {
        dispatch(dismissIncomingCallNotification(callID, startAt));
    };

    const onJoin = () => {
        dispatch({
            type: REMOVE_INCOMING_CALL,
            data: {
                callID,
            },
        });

        if (connectedID) {
            if (global && desktopGTE(5, 5)) {
                logDebug('sending calls-join-request message to desktop app');
                sendDesktopEvent('calls-join-request', {
                    targetID: callID,
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
                    targetID: callID,
                });
                return;
            }

            dispatch(showSwitchCallModal(callID));
            return;
        }
        window.postMessage({type: 'connectCall', channelID: callID}, window.origin);
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
    const callUniqueID = `${call.callID}${call.startAt}`;
    const didRing = useSelector((state: GlobalState) => didRingForCall(state, callUniqueID));

    useEffect(() => {
        const stopRinging = () => {
            notificationSounds?.stopRing();
            dispatch({
                type: DID_RING_FOR_CALL,
                data: {
                    callUniqueID,
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
        notificationSounds?.ring(currentUser.notify_props.calls_notification_sound || 'Dynamic');
        const timer = setTimeout(() => stopRinging(), RING_LENGTH);

        // eslint-disable-next-line consistent-return
        return () => {
            clearTimeout(timer);
            stopRinging();
        };
    }, [call, callUniqueID, didRing, onWidget, currentUser.notify_props, dispatch]);
};
