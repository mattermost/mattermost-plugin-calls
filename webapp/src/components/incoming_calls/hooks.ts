import {ChannelMembership} from '@mattermost/types/channels';
import {GlobalState} from '@mattermost/types/store';
import {UserProfile} from '@mattermost/types/users';
import {NotificationLevel} from 'mattermost-redux/constants/channels';
import {getChannel, getMyChannelMember} from 'mattermost-redux/selectors/entities/channels';
import {getTeammateNameDisplaySetting} from 'mattermost-redux/selectors/entities/preferences';
import {getCurrentUser, getUser, makeGetProfilesInChannel} from 'mattermost-redux/selectors/entities/users';
import {displayUsername} from 'mattermost-redux/utils/user_utils';
import {useEffect} from 'react';
import {useIntl} from 'react-intl';
import {useDispatch, useSelector, useStore} from 'react-redux';

import {DID_NOTIFY_FOR_CALL, DID_RING_FOR_CALL} from 'src/action_types';
import {dismissIncomingCallNotification, showSwitchCallModal} from 'src/actions';
import {DEFAULT_RING_SOUND, RING_LENGTH} from 'src/constants';
import {logDebug} from 'src/log';
import {connectedChannelID, didNotifyForCall, didRingForCall} from 'src/selectors';
import {ChannelType, IncomingCallNotification} from 'src/types/types';
import {desktopGTE, getChannelURL, sendDesktopEvent, shouldRenderDesktopWidget, split} from 'src/utils';
import {notificationSounds, sendDesktopNotificationToMe} from 'src/webapp_globals';

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

const getNotificationSoundFromChannelMemberAndUser = (member: ChannelMembership | null | undefined, user: UserProfile) => {
    // @ts-ignore We're using an outdated webapp
    if (member?.notify_props?.desktop_notification_sound) {
        // @ts-ignore same
        return member.notify_props.desktop_notification_sound;
    }

    // @ts-ignore same
    return user.notify_props?.desktop_notification_sound ? user.notify_props.desktop_notification_sound : 'Bing';
};

export const useRinging = (call: IncomingCallNotification, onWidget: boolean) => {
    const dispatch = useDispatch();
    const currentUser = useSelector(getCurrentUser);
    const didRing = useSelector((state: GlobalState) => didRingForCall(state, call.callID));
    useNotification(call);

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

export const useNotification = (call: IncomingCallNotification) => {
    const {formatMessage} = useIntl();
    const dispatch = useDispatch();
    const channel = useSelector((state: GlobalState) => getChannel(state, call.callID));
    const currentUser = useSelector(getCurrentUser);
    const myChannelMember = useSelector((state: GlobalState) => getMyChannelMember(state, call.callID));
    const url = useSelector((state: GlobalState) => getChannelURL(state, channel, channel.team_id));
    const callUniqueID = `${call.callID}${call.startAt}`;
    const didNotify = useSelector((state: GlobalState) => didNotifyForCall(state, callUniqueID));
    const [hostName, others] = useGetHostNameAndOthers(call, 2);

    const title = others.length === 0 ? hostName : others;
    const body = formatMessage({defaultMessage: '{hostName} is inviting you to a call'}, {hostName});

    useEffect(() => {
        if (document.visibilityState === 'hidden' && !didNotify) {
            if (sendDesktopNotificationToMe) {
                const soundName = getNotificationSoundFromChannelMemberAndUser(myChannelMember, currentUser);
                dispatch(sendDesktopNotificationToMe(title, body, channel, channel.team_id, false, soundName, url));
            }
        }

        // record DID_NOTIFY regardless, because we don't want to notify after the first appearance of this call
        dispatch({
            type: DID_NOTIFY_FOR_CALL,
            data: {
                callUniqueID,
            },
        });
    }, []);
};

export const useGetHostNameAndOthers = (call: IncomingCallNotification, splitAt: number) => {
    const {formatMessage, formatList} = useIntl();
    const teammateNameDisplay = useSelector(getTeammateNameDisplaySetting);
    const host = useSelector((state: GlobalState) => getUser(state, call.hostID));
    const currentUser = useSelector(getCurrentUser);
    const doGetProfilesInChannel = makeGetProfilesInChannel();
    const gmMembers = useSelector((state: GlobalState) => doGetProfilesInChannel(state, call.callID));
    const hostName = displayUsername(host, teammateNameDisplay, false);

    let others = '';
    if (call.type === ChannelType.GM) {
        const otherMembers = gmMembers.filter((u) => u.id !== host.id && u.id !== currentUser.id);
        const [displayed, overflowed] = split(otherMembers, splitAt);
        const users = displayed.map((u) => displayUsername(u, teammateNameDisplay));
        if (overflowed) {
            users.push(formatMessage({defaultMessage: '{num, plural, one {# other} other {# others}}'},
                {num: overflowed.length}));
        }
        others = formatList(users);
    }

    return [hostName, others];
};
