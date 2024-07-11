/* eslint-disable max-lines */

import {CallsConfig, CallState} from '@mattermost/calls-common/lib/types';
import {ClientError} from '@mattermost/client';
import {Channel} from '@mattermost/types/channels';
import {UserTypes} from 'mattermost-redux/action_types';
import {getChannel as loadChannel} from 'mattermost-redux/actions/channels';
import {bindClientFunc} from 'mattermost-redux/actions/helpers';
import {getThread as fetchThread} from 'mattermost-redux/actions/threads';
import {getProfilesByIds as getProfilesByIdsAction} from 'mattermost-redux/actions/users';
import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getConfig} from 'mattermost-redux/selectors/entities/general';
import {getCurrentTeamId} from 'mattermost-redux/selectors/entities/teams';
import {getThread} from 'mattermost-redux/selectors/entities/threads';
import {getCurrentUserId, getUser, isCurrentUserSystemAdmin} from 'mattermost-redux/selectors/entities/users';
import {ActionFunc, ActionFuncAsync, DispatchFunc, GetStateFunc} from 'mattermost-redux/types/actions';
import {MessageDescriptor} from 'react-intl';
import {AnyAction, Dispatch} from 'redux';
import {batchActions} from 'redux-batched-actions';
import {CloudFreeTrialModalAdmin, CloudFreeTrialModalUser, IDAdmin, IDUser} from 'src/cloud_pricing/modals';
import {CallErrorModal, CallErrorModalID} from 'src/components/call_error_modal';
import {GenericErrorModal, IDGenericErrorModal} from 'src/components/generic_error_modal';
import {CallsInTestModeModal, IDTestModeUser} from 'src/components/modals';
import {RING_LENGTH} from 'src/constants';
import {logErr} from 'src/log';
import RestClient from 'src/rest_client';
import {
    callDismissedNotification,
    calls, channelIDForCurrentCall,
    hostChangeAtForCurrentCall,
    idForCurrentCall,
    incomingCalls,
    numSessionsInCallInChannel,
    ringingForCall,
} from 'src/selectors';
import * as Telemetry from 'src/types/telemetry';
import {CallsStats, ChannelType} from 'src/types/types';
import {
    getPluginPath,
    getSessionsMapFromSessions,
    getUserIDsForSessions,
    isDesktopApp,
    isDMChannel,
    isGMChannel,
    notificationsStopRinging,
} from 'src/utils';
import {modals, notificationSounds, openPricingModal} from 'src/webapp_globals';

import {
    ADD_INCOMING_CALL,
    CALL_END,
    CALL_HOST,
    CALL_LIVE_CAPTIONS_STATE,
    CALL_REC_PROMPT_DISMISSED,
    CALL_RECORDING_STATE,
    CALL_STATE,
    CLIENT_CONNECTING,
    DID_RING_FOR_CALL,
    DISMISS_CALL,
    HIDE_END_CALL_MODAL,
    HIDE_EXPANDED_VIEW,
    HIDE_SCREEN_SOURCE_MODAL,
    HIDE_SWITCH_CALL_MODAL,
    LIVE_CAPTIONS_ENABLED,
    RECEIVED_CALLS_CONFIG,
    RECORDINGS_ENABLED,
    REMOVE_INCOMING_CALL,
    RINGING_FOR_CALL,
    RTCD_ENABLED,
    SHOW_EXPANDED_VIEW,
    SHOW_SCREEN_SOURCE_MODAL,
    SHOW_SWITCH_CALL_MODAL,
    TRANSCRIBE_API,
    TRANSCRIPTIONS_ENABLED,
    USER_LEFT,
    USER_SCREEN_ON,
    USERS_STATES,
} from './action_types';

export const showExpandedView = () => (dispatch: Dispatch) => {
    dispatch({
        type: SHOW_EXPANDED_VIEW,
    });
};

export const hideExpandedView = () => (dispatch: Dispatch) => {
    dispatch({
        type: HIDE_EXPANDED_VIEW,
    });
};

export const showSwitchCallModal = (targetID?: string) => (dispatch: Dispatch) => {
    dispatch({
        type: SHOW_SWITCH_CALL_MODAL,
        data: {
            targetID,
        },
    });
};

export const hideSwitchCallModal = () => (dispatch: Dispatch) => {
    dispatch({
        type: HIDE_SWITCH_CALL_MODAL,
    });
};

export const hideEndCallModal = () => (dispatch: Dispatch) => {
    dispatch({
        type: HIDE_END_CALL_MODAL,
    });
};

export const showScreenSourceModal = () => (dispatch: Dispatch) => {
    dispatch({
        type: SHOW_SCREEN_SOURCE_MODAL,
    });
};

export const hideScreenSourceModal = () => (dispatch: Dispatch) => {
    dispatch({
        type: HIDE_SCREEN_SOURCE_MODAL,
    });
};

export const getCallsConfig = (): ActionFuncAsync<CallsConfig> => {
    return bindClientFunc({
        clientFunc: () => RestClient.fetch<CallsConfig>(
            `${getPluginPath()}/config`,
            {method: 'get'},
        ),
        onSuccess: [RECEIVED_CALLS_CONFIG],
    });
};

export const getCallActive = async (channelID: string) => {
    try {
        const res = await RestClient.fetch<{ active: boolean }>(
            `${getPluginPath()}/calls/${channelID}/active`,
            {method: 'get'},
        );
        return res.active;
    } catch (e) {
        return false;
    }
};

export const setRecordingsEnabled = (enabled: boolean) => (dispatch: Dispatch) => {
    dispatch({
        type: RECORDINGS_ENABLED,
        data: enabled,
    });
};

export const setRTCDEnabled = (enabled: boolean) => (dispatch: Dispatch) => {
    dispatch({
        type: RTCD_ENABLED,
        data: enabled,
    });
};

export const setTranscriptionsEnabled = (enabled: boolean) => (dispatch: Dispatch) => {
    dispatch({
        type: TRANSCRIPTIONS_ENABLED,
        data: enabled,
    });
};

export const setLiveCaptionsEnabled = (enabled: boolean) => (dispatch: Dispatch) => {
    dispatch({
        type: LIVE_CAPTIONS_ENABLED,
        data: enabled,
    });
};

export const setTranscribeAPI = (val: string) => (dispatch: Dispatch) => {
    dispatch({
        type: TRANSCRIBE_API,
        data: val,
    });
};

export const notifyAdminCloudFreeTrial = async () => {
    return RestClient.fetch(
        `${getPluginPath()}/cloud-notify-admins`,
        {method: 'post'},
    );
};

export const displayFreeTrial = () => {
    return async (dispatch: DispatchFunc, getState: GetStateFunc) => {
        const isAdmin = isCurrentUserSystemAdmin(getState());

        if (isAdmin) {
            dispatch(modals.openModal({
                modalId: IDAdmin,
                dialogType: CloudFreeTrialModalAdmin,
            }));
        } else {
            dispatch(modals.openModal({
                modalId: IDUser,
                dialogType: CloudFreeTrialModalUser,
            }));
        }

        return {};
    };
};

export const displayCloudPricing = () => {
    return async (_: DispatchFunc, getState: GetStateFunc) => {
        const isAdmin = isCurrentUserSystemAdmin(getState());
        if (!isAdmin) {
            return {};
        }

        openPricingModal()({trackingLocation: 'calls > '});
        return {};
    };
};

export const requestOnPremTrialLicense = async (users: number, termsAccepted: boolean, receiveEmailsAccepted: boolean) => {
    try {
        const response = await RestClient.fetch(
            `${RestClient.getBaseRoute()}/trial-license`,
            {
                method: 'post',
                body: JSON.stringify({
                    users,
                    terms_accepted: termsAccepted,
                    receive_emails_accepted: receiveEmailsAccepted,
                }),
            },
        );
        return {data: response};
    } catch (e) {
        // In the event that the status code returned is 451, this request has been blocked because it originated from an embargoed country
        const err = e as ClientError;
        return {error: err.message, data: {status: err.status_code}};
    }
};

export const endCall = (channelID: string) => {
    return RestClient.fetch(
        `${getPluginPath()}/calls/${channelID}/host/end`,
        {method: 'post'},
    );
};

export const displayCallErrorModal = (err: Error, channelID?: string) => (dispatch: Dispatch) => {
    dispatch(modals.openModal({
        modalId: CallErrorModalID,
        dialogType: CallErrorModal,
        dialogProps: {
            channelID,
            err,
        },
    }));
};

export const trackEvent = (event: Telemetry.Event, source: Telemetry.Source, props?: Record<string, string>) => {
    return (_: DispatchFunc, getState: GetStateFunc) => {
        const config = getConfig(getState());
        if (config.DiagnosticsEnabled !== 'true') {
            return;
        }
        if (!props) {
            props = {};
        }
        const eventData = {
            event,
            clientType: isDesktopApp() ? 'desktop' : 'web',
            source,
            props,
        };
        RestClient.fetch(
            `${getPluginPath()}/telemetry/track`,
            {method: 'post', body: JSON.stringify(eventData)},
        ).catch((e) => {
            logErr(e);
        });
    };
};

export function prefetchThread(postId: string) {
    return async (dispatch: DispatchFunc, getState: GetStateFunc) => {
        const state = getState();
        const teamId = getCurrentTeamId(state);
        const currentUserId = getCurrentUserId(state);

        const thread = getThread(state, postId) ?? (await dispatch(fetchThread(currentUserId, teamId, postId, true))).data;

        return {data: thread};
    };
}

export const startCallRecording = (callID: string) => (dispatch: Dispatch) => {
    RestClient.fetch(
        `${getPluginPath()}/calls/${callID}/recording/start`,
        {method: 'post'},
    ).catch((err) => {
        dispatch({
            type: CALL_RECORDING_STATE,
            data: {
                callID,
                jobState: {
                    init_at: 0,
                    start_at: 0,
                    end_at: 0,
                    err: err.message,
                    error_at: Date.now(),
                },
            },
        });
    });
};

export const stopCallRecording = async (callID: string) => {
    return RestClient.fetch(
        `${getPluginPath()}/calls/${callID}/recording/stop`,
        {method: 'post'},
    );
};

export const recordingPromptDismissedAt = (callID: string, dismissedAt: number) => (dispatch: Dispatch) => {
    dispatch({
        type: CALL_REC_PROMPT_DISMISSED,
        data: {
            callID,
            dismissedAt,
        },
    });

    if (window.currentCallData) {
        window.currentCallData.recordingPromptDismissedAt = dismissedAt;
    }
};

export const displayCallsTestModeUser = () => {
    return async (dispatch: DispatchFunc) => {
        dispatch(modals.openModal({
            modalId: IDTestModeUser,
            dialogType: CallsInTestModeModal,
        }));

        return {};
    };
};

export const displayGenericErrorModal = (title: MessageDescriptor, message: MessageDescriptor, confirmText?: MessageDescriptor) => {
    return async (dispatch: DispatchFunc) => {
        dispatch(modals.openModal({
            modalId: IDGenericErrorModal,
            dialogType: GenericErrorModal,
            dialogProps: {
                title,
                message,
                confirmText,
            },
        }));

        return {};
    };
};

export function incomingCallOnChannel(channelID: string, callID: string, callerID: string, startAt: number) {
    return async (dispatch: DispatchFunc, getState: GetStateFunc) => {
        let channel: Channel | undefined = getChannel(getState(), channelID);
        if (!channel) {
            const res = await dispatch(loadChannel(channelID));
            channel = res.data;
        }

        if (!channel || !(isDMChannel(channel) || isGMChannel(channel))) {
            return;
        }

        if (callDismissedNotification(getState(), channelID)) {
            return;
        }

        if (incomingCalls(getState()).findIndex((ic) => ic.callID === callID) >= 0) {
            return;
        }

        // Never send a notification for a call you started yourself, or a call you are currently in.
        const currentUserID = getCurrentUserId(getState());
        const currentCallID = idForCurrentCall(getState());
        if (currentUserID === callerID || currentCallID === callID) {
            return;
        }

        const caller = getUser(getState(), callerID);
        if (!caller) {
            await dispatch(getProfilesByIdsAction([callerID]));
        }

        dispatch({
            type: ADD_INCOMING_CALL,
            data: {
                callID,
                channelID,
                callerID,
                startAt,
                type: isDMChannel(channel) ? ChannelType.DM : ChannelType.GM,
            },
        });
    };
}

export const userLeft = (channelID: string, userID: string, sessionID: string) => {
    return (dispatch: DispatchFunc, getState: GetStateFunc) => {
        dispatch({
            type: USER_LEFT,
            data: {
                channelID,
                userID,
                session_id: sessionID,
                currentUserID: getCurrentUserId(getState()),
            },
        });

        if (numSessionsInCallInChannel(getState(), channelID) === 0) {
            dispatch(callEnd(channelID));
        }
    };
};

export const callEnd = (channelID: string) => {
    return (dispatch: DispatchFunc, getState: GetStateFunc) => {
        if (channelIDForCurrentCall(getState()) === channelID) {
            window.callsClient?.disconnect();
        }

        const callID = calls(getState())[channelID]?.ID || '';

        dispatch({
            type: CALL_END,
            data: {
                channelID,
                callID,
            },
        });

        dispatch(removeIncomingCallNotification(callID));
    };
};

export const dismissIncomingCallNotification = (channelID: string, callID: string) => {
    return (dispatch: DispatchFunc) => {
        RestClient.fetch(
            `${getPluginPath()}/calls/${channelID}/dismiss-notification`,
            {method: 'post'},
        ).catch((e) => logErr(e));
        dispatch(removeIncomingCallNotification(callID));
        dispatch({
            type: DISMISS_CALL,
            data: {
                callID,
            },
        });
    };
};

export const removeIncomingCallNotification = (callID: string): ActionFunc => {
    return (dispatch: DispatchFunc) => {
        dispatch(stopRingingForCall(callID));
        dispatch({
            type: REMOVE_INCOMING_CALL,
            data: {
                callID,
            },
        });
        return {};
    };
};

export const ringForCall = (callID: string, sound: string) => {
    return (dispatch: DispatchFunc) => {
        notificationSounds?.ring(sound);

        // window.e2eNotificationsSoundedAt is added when running the e2e tests
        if (window.e2eNotificationsSoundedAt) {
            window.e2eNotificationsSoundedAt.push(Date.now());
        }

        // register we've rang, so we don't ring again ever for this call
        dispatch({
            type: RINGING_FOR_CALL,
            data: {
                callID,
            },
        });

        // window.e2eRingLength is added when running the e2e tests
        const ringLength = window.e2eRingLength ? window.e2eRingLength : RING_LENGTH;
        setTimeout(() => dispatch(stopRingingForCall(callID)), ringLength);
    };
};

export const stopRingingForCall = (callID: string): ActionFunc => {
    return (dispatch: DispatchFunc, getState: GetStateFunc) => {
        if (ringingForCall(getState(), callID)) {
            notificationsStopRinging();
        }
        dispatch({
            type: DID_RING_FOR_CALL,
            data: {
                callID,
            },
        });
        return {};
    };
};

export const loadProfilesByIdsIfMissing = (ids: string[]) => {
    return async (dispatch: DispatchFunc, getState: GetStateFunc) => {
        const missingIds = [];
        for (const id of ids) {
            if (!getState().entities.users.profiles[id]) {
                missingIds.push(id);
            }
        }
        if (missingIds.length > 0) {
            dispatch({type: UserTypes.RECEIVED_PROFILES, data: await RestClient.getProfilesByIds(missingIds)});
        }
    };
};

export const loadCallState = (channelID: string, call: CallState) => (dispatch: DispatchFunc, getState: GetStateFunc) => {
    const actions: AnyAction[] = [];

    actions.push({
        type: CALL_STATE,
        data: {
            ID: call.id,
            channelID,
            startAt: call.start_at,
            ownerID: call.owner_id,
            threadID: call.thread_id,
        },
    });

    actions.push({
        type: CALL_RECORDING_STATE,
        data: {
            callID: channelID,
            jobState: call.recording,
        },
    });

    actions.push({
        type: CALL_LIVE_CAPTIONS_STATE,
        data: {
            callID: channelID,
            jobState: call.live_captions,
        },
    });

    actions.push({
        type: USER_SCREEN_ON,
        data: {
            channelID,
            userID: call.screen_sharing_id,
            session_id: call.screen_sharing_session_id,
        },
    });

    actions.push({
        type: CALL_HOST,
        data: {
            channelID,
            hostID: call.host_id,
            hostChangeAt: hostChangeAtForCurrentCall(getState()) || call.start_at,
        },
    });

    const dismissed = call.dismissed_notification;
    if (dismissed) {
        const currentUserID = getCurrentUserId(getState());
        if (Object.hasOwn(dismissed, currentUserID) && dismissed[currentUserID]) {
            actions.push({
                type: DISMISS_CALL,
                data: {
                    callID: call.id,
                },
            });
        }
    }

    if (call.sessions.length > 0) {
        // This is async, which is expected as we are okay with setting the state while we wait
        // for any missing user profiles.
        dispatch(loadProfilesByIdsIfMissing(getUserIDsForSessions(call.sessions)));
    }

    actions.push({
        type: USERS_STATES,
        data: {
            states: getSessionsMapFromSessions(call.sessions),
            channelID,
        },
    });

    dispatch(batchActions(actions));
};

export const setClientConnecting = (value: boolean) => (dispatch: Dispatch) => {
    dispatch({
        type: CLIENT_CONNECTING,
        data: value,
    });
};

export const hostMake = async (callID: string, newHostID: string) => {
    return RestClient.fetch(
        `${getPluginPath()}/calls/${callID}/host/make`,
        {
            method: 'post',
            body: JSON.stringify({new_host_id: newHostID}),
        },
    );
};

export const hostMute = async (callID: string, sessionID: string) => {
    return RestClient.fetch(
        `${getPluginPath()}/calls/${callID}/host/mute`,
        {
            method: 'post',
            body: JSON.stringify({session_id: sessionID}),
        },
    );
};

export const hostScreenOff = async (callID: string, sessionID: string) => {
    return RestClient.fetch(
        `${getPluginPath()}/calls/${callID}/host/screen-off`,
        {
            method: 'post',
            body: JSON.stringify({session_id: sessionID}),
        },
    );
};

export const hostLowerHand = async (callID: string, sessionID: string) => {
    return RestClient.fetch(
        `${getPluginPath()}/calls/${callID}/host/lower-hand`,
        {
            method: 'post',
            body: JSON.stringify({session_id: sessionID}),
        },
    );
};

export const hostRemove = async (callID?: string, sessionID?: string) => {
    if (!callID || !sessionID) {
        return {};
    }

    return RestClient.fetch(
        `${getPluginPath()}/calls/${callID}/host/remove`,
        {
            method: 'post',
            body: JSON.stringify({session_id: sessionID}),
        },
    );
};

export const hostMuteOthers = async (callID?: string) => {
    if (!callID) {
        return {};
    }

    return RestClient.fetch(
        `${getPluginPath()}/calls/${callID}/host/mute-others`,
        {method: 'post'},
    );
};

export const getCallsStats = async () => {
    return RestClient.fetch<CallsStats>(`${getPluginPath()}/stats`, {method: 'get'});
};

export const selectRHSPost = (postID: string): ActionFuncAsync => {
    return async (dispatch: DispatchFunc) => {
        if (window.ProductApi) {
            dispatch(window.ProductApi.selectRhsPost(postID));
        }
        return {};
    };
};
