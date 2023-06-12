import {GlobalState} from '@mattermost/types/store';
import {NotificationLevel} from 'mattermost-redux/constants/channels';
import {getCurrentUser} from 'mattermost-redux/selectors/entities/users';
import {useEffect} from 'react';
import {useDispatch, useSelector} from 'react-redux';

import {DID_RING_FOR_CALL, REMOVE_INCOMING_CALL} from 'src/action_types';
import {dismissIncomingCallNotification, showSwitchCallModal} from 'src/actions';
import {connectedChannelID, didRingForCall} from 'src/selectors';
import {IncomingCallNotification} from 'src/types/types';
import {shouldRenderDesktopWidget} from 'src/utils';
import {notificationSounds} from 'src/webapp_globals';

const RingLength = 10000;

export const useDismissJoin = (callID: string, startAt: number) => {
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
        const timer = setTimeout(() => stopRinging(), RingLength);

        // eslint-disable-next-line consistent-return
        return () => {
            clearTimeout(timer);
            stopRinging();
        };
    }, [call, callUniqueID, didRing, onWidget, currentUser.notify_props, dispatch]);
};
