import {CallsConfig, CallState, UserSessionState} from '@calls/common/lib/types';
import {MessageDescriptor} from 'react-intl';
import {Dispatch, AnyAction} from 'redux';
import {batchActions} from 'redux-batched-actions';

import {ClientError} from '@mattermost/client';
import {getChannel as loadChannel} from 'mattermost-redux/actions/channels';
import {bindClientFunc} from 'mattermost-redux/actions/helpers';
import {getThread as fetchThread} from 'mattermost-redux/actions/threads';
import {getProfilesByIds as getProfilesByIdsAction} from 'mattermost-redux/actions/users';
import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getConfig} from 'mattermost-redux/selectors/entities/general';
import {getCurrentTeamId} from 'mattermost-redux/selectors/entities/teams';
import {getThread} from 'mattermost-redux/selectors/entities/threads';
import {getCurrentUserId, getUser, isCurrentUserSystemAdmin} from 'mattermost-redux/selectors/entities/users';
import {ActionFunc, DispatchFunc, GenericAction, GetStateFunc} from 'mattermost-redux/types/actions';
import {CloudFreeTrialModalAdmin, CloudFreeTrialModalUser, IDAdmin, IDUser} from 'src/cloud_pricing/modals';
import {CallErrorModal, CallErrorModalID} from 'src/components/call_error_modal';
import {GenericErrorModal, IDGenericErrorModal} from 'src/components/generic_error_modal';
import {CallsInTestModeModal, IDTestModeUser} from 'src/components/modals';
import {RING_LENGTH} from 'src/constants';
import {logErr} from 'src/log';
import RestClient from 'src/rest_client';
import {
    channelHasCall, idForCurrentCall, incomingCalls,
    ringingEnabled,
    ringingForCall,
    callDismissedNotification,
    calls,
    hostChangeAtForCurrentCall,
} from 'src/selectors';
import * as Telemetry from 'src/types/telemetry';
import {ChannelType} from 'src/types/types';
import {
    getPluginPath,
    isDesktopApp,
    isDMChannel,
    isGMChannel,
    notificationsStopRinging,
    getProfilesForSessions,
} from 'src/utils';
import {modals, notificationSounds, openPricingModal} from 'src/webapp_globals';

import {
    ADD_INCOMING_CALL,
    HIDE_END_CALL_MODAL,
    HIDE_EXPANDED_VIEW,
    HIDE_SCREEN_SOURCE_MODAL,
    HIDE_SWITCH_CALL_MODAL,
    RECEIVED_CALLS_CONFIG,
    RECORDINGS_ENABLED,
    SHOW_EXPANDED_VIEW,
    SHOW_SCREEN_SOURCE_MODAL,
    SHOW_SWITCH_CALL_MODAL,
    CALL_REC_PROMPT_DISMISSED,
    CALL_RECORDING_STATE,
    RTCD_ENABLED,
    REMOVE_INCOMING_CALL,
    DID_RING_FOR_CALL,
    RINGING_FOR_CALL,
    DISMISS_CALL,
    CALL_STATE,
    USERS_STATES,
    PROFILES_JOINED,
    CALL_HOST,
    USER_SCREEN_ON,
    USER_LEFT,
} from './action_types';

export const showExpandedView = () => (dispatch: Dispatch<GenericAction>) => {
    dispatch({
        type: SHOW_EXPANDED_VIEW,
    });
};

export const hideExpandedView = () => (dispatch: Dispatch<GenericAction>) => {
    dispatch({
        type: HIDE_EXPANDED_VIEW,
    });
};

export const showSwitchCallModal = (targetID?: string) => (dispatch: Dispatch<GenericAction>) => {
    dispatch({
        type: SHOW_SWITCH_CALL_MODAL,
        data: {
            targetID,
        },
    });
};

export const hideSwitchCallModal = () => (dispatch: Dispatch<GenericAction>) => {
    dispatch({
        type: HIDE_SWITCH_CALL_MODAL,
    });
};

export const hideEndCallModal = () => (dispatch: Dispatch<GenericAction>) => {
    dispatch({
        type: HIDE_END_CALL_MODAL,
    });
};

export const showScreenSourceModal = () => (dispatch: Dispatch<GenericAction>) => {
    dispatch({
        type: SHOW_SCREEN_SOURCE_MODAL,
    });
};

export const hideScreenSourceModal = () => (dispatch: Dispatch<GenericAction>) => {
    dispatch({
        type: HIDE_SCREEN_SOURCE_MODAL,
    });
};

export const getCallsConfig = (): ActionFunc => {
    return bindClientFunc({
        clientFunc: () => RestClient.fetch<CallsConfig>(
            `${getPluginPath()}/config`,
            {method: 'get'},
        ),
        onSuccess: [RECEIVED_CALLS_CONFIG],
    });
};

export const setRecordingsEnabled = (enabled: boolean) => (dispatch: Dispatch<GenericAction>) => {
    dispatch({
        type: RECORDINGS_ENABLED,
        data: enabled,
    });
};

export const setRTCDEnabled = (enabled: boolean) => (dispatch: Dispatch<GenericAction>) => {
    dispatch({
        type: RTCD_ENABLED,
        data: enabled,
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
    return async (dispatch: DispatchFunc, getState: GetStateFunc) => {
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
        `${getPluginPath()}/calls/${channelID}/end`,
        {method: 'post'},
    );
};

export const displayCallErrorModal = (channelID: string, err: Error) => (dispatch: Dispatch<GenericAction>) => {
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
    return (dispatch: DispatchFunc, getState: GetStateFunc) => {
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

export const startCallRecording = (callID: string) => (dispatch: Dispatch<GenericAction>) => {
    RestClient.fetch(
        `${getPluginPath()}/calls/${callID}/recording/start`,
        {method: 'post'},
    ).catch((err) => {
        dispatch({
            type: CALL_RECORDING_STATE,
            data: {
                callID,
                recState: {
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

export const recordingPromptDismissedAt = (callID: string, dismissedAt: number) => (dispatch: Dispatch<GenericAction>) => {
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

export const displayGenericErrorModal = (title: MessageDescriptor, message: MessageDescriptor) => {
    return async (dispatch: DispatchFunc) => {
        dispatch(modals.openModal({
            modalId: IDGenericErrorModal,
            dialogType: GenericErrorModal,
            dialogProps: {
                title,
                message,
            },
        }));

        return {};
    };
};

export function incomingCallOnChannel(channelID: string, callID: string, callerID: string, startAt: number) {
    return async (dispatch: DispatchFunc, getState: GetStateFunc) => {
        let channel = getChannel(getState(), channelID);
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

        await dispatch({
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
    return async (dispatch: DispatchFunc, getState: GetStateFunc) => {
        // save for later
        const callID = calls(getState())[channelID].ID || '';

        await dispatch({
            type: USER_LEFT,
            data: {
                channelID,
                userID,
                session_id: sessionID,
                currentUserID: getCurrentUserId(getState()),
            },
        });

        if (ringingEnabled(getState()) && !channelHasCall(getState(), channelID)) {
            await dispatch(removeIncomingCallNotification(callID));
        }
    };
};

export const dismissIncomingCallNotification = (channelID: string, callID: string) => {
    return async (dispatch: DispatchFunc) => {
        RestClient.fetch(
            `${getPluginPath()}/calls/${channelID}/dismiss-notification`,
            {method: 'post'},
        ).catch((e) => logErr(e));
        await dispatch(removeIncomingCallNotification(callID));
        dispatch({
            type: DISMISS_CALL,
            data: {
                callID,
            },
        });
    };
};

export const removeIncomingCallNotification = (callID: string): ActionFunc => {
    return async (dispatch: DispatchFunc) => {
        await dispatch(stopRingingForCall(callID));
        await dispatch({
            type: REMOVE_INCOMING_CALL,
            data: {
                callID,
            },
        });
        return {};
    };
};

export const ringForCall = (callID: string, sound: string) => {
    return async (dispatch: DispatchFunc) => {
        notificationSounds?.ring(sound);

        // window.e2eNotificationsSoundedAt is added when running the e2e tests
        if (window.e2eNotificationsSoundedAt) {
            window.e2eNotificationsSoundedAt.push(Date.now());
        }

        // register we've rang, so we don't ring again ever for this call
        await dispatch({
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
    return async (dispatch: DispatchFunc, getState: GetStateFunc) => {
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

export const loadCallState = (channelID: string, call: CallState) => async (dispatch: DispatchFunc, getState: GetStateFunc) => {
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
            recState: call.recording,
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

    const states: Record<string, UserSessionState> = {};
    for (let i = 0; i < call.sessions.length; i++) {
        states[call.sessions[i].session_id] = call.sessions[i];
    }

    if (call.sessions.length > 0) {
        actions.push({
            type: PROFILES_JOINED,
            data: {
                profiles: await getProfilesForSessions(getState(), call.sessions),
                channelID,
            },
        });
    }

    actions.push({
        type: USERS_STATES,
        data: {
            states,
            channelID,
        },
    });

    dispatch(batchActions(actions));
};
