// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/* eslint-disable max-lines */

import {CallChannelState, CallsConfig, CallState, CallsVersionInfo} from '@mattermost/calls-common/lib/types';
import {ClientError} from '@mattermost/client';
import {Channel} from '@mattermost/types/channels';
import {UserProfile} from '@mattermost/types/users';
import {UserTypes} from 'mattermost-redux/action_types';
import {getChannel as loadChannel} from 'mattermost-redux/actions/channels';
import {bindClientFunc} from 'mattermost-redux/actions/helpers';
import {getThread as fetchThread} from 'mattermost-redux/actions/threads';
import {getProfilesByIds as getProfilesByIdsAction} from 'mattermost-redux/actions/users';
import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentTeamId} from 'mattermost-redux/selectors/entities/teams';
import {getThread} from 'mattermost-redux/selectors/entities/threads';
import {getCurrentUserId, getUser, isCurrentUserSystemAdmin} from 'mattermost-redux/selectors/entities/users';
import {ActionFunc, ActionFuncAsync, DispatchFunc, GetStateFunc} from 'mattermost-redux/types/actions';
import {MessageDescriptor} from 'react-intl';
import {AnyAction, Dispatch} from 'redux';
import {batchActions} from 'redux-batched-actions';
import RestClient from 'src/clients/rest';
import {CloudFreeTrialModalAdmin, CloudFreeTrialModalUser, IDAdmin, IDUser} from 'src/cloud_pricing/modals';
import {ErrorModal, IdForErrorModel} from 'src/components/error_modal';
import {GenericErrorModal, IDGenericErrorModal} from 'src/components/generic_error_modal';
import {CallsInTestModeModal, IDTestModeUser} from 'src/components/modals';
import {JOINED_USER_NOTIFICATION_TIMEOUT, RING_LENGTH} from 'src/constants';
import {logErr} from 'src/log';
import {
    callDismissedNotification,
    callStartAtForCallInChannel,
    getCallIDForChannel,
    getCallIDForCurrentCall,
    incomingCalls,
    numSessionsInCallInChannel,
    ringingEnabled,
    ringingForCall,
    shouldPlayJoinUserSound,
} from 'src/selectors';
import {activeCallAdded} from 'src/state/active_calls/actions';
import {channelCallsAvailabilityUpdated} from 'src/state/calls_availability/actions';
import {callEnded} from 'src/state/common_actions';
import {hostChanged} from 'src/state/hosts/actions';
import {getHostChangeAt} from 'src/state/hosts/selectors';
import {userScreenShared} from 'src/state/screen_sharing_ids/actions';
import {getSessionsMapFromSessions, sessionsReceived, userJoined, userLeft} from 'src/state/sessions/actions';
import {getUserIDsFromSessions} from 'src/state/sessions/selectors';
import {CallsStats, ChannelType} from 'src/types/types';
import {
    getCallsClientSessionID,
    getPluginPath,
    isDMChannel,
    isGMChannel,
    notificationsStopRinging,
    playSound,
} from 'src/utils';
import {modals, notificationSounds, openPricingModal} from 'src/webapp_globals';

import {
    ADD_INCOMING_CALL,
    CALL_LIVE_CAPTIONS_STATE,
    CALL_REC_PROMPT_DISMISSED,
    CALL_RECORDING_STATE,
    CLIENT_CONNECTING,
    DID_RING_FOR_CALL,
    DISMISS_CALL,
    HIDE_EXPANDED_VIEW,
    HIDE_SCREEN_SOURCE_MODAL,
    HIDE_SWITCH_CALL_MODAL,
    LIVE_CAPTIONS_ENABLED,
    LOCAL_SESSION_CLOSE,
    RECEIVED_CALLS_CONFIG,
    RECEIVED_CALLS_CONFIG_ENV_OVERRIDES,
    RECEIVED_CALLS_VERSION_INFO,
    RECORDINGS_ENABLED,
    REMOVE_INCOMING_CALL,
    RINGING_FOR_CALL,
    RTCD_ENABLED,
    SHOW_EXPANDED_VIEW,
    SHOW_SCREEN_SOURCE_MODAL,
    SHOW_SWITCH_CALL_MODAL,
    TRANSCRIBE_API,
    TRANSCRIPTIONS_ENABLED,
    USER_JOINED_TIMEOUT,
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

export const getCallsConfigEnvOverrides = (): ActionFuncAsync<Record<string, string>> => {
    return bindClientFunc({
        clientFunc: () => RestClient.fetch<Record<string, string>>(
            `${getPluginPath()}/env`,
            {method: 'get'},
        ),
        onSuccess: [RECEIVED_CALLS_CONFIG_ENV_OVERRIDES],
    });
};

export const getCallsVersionInfo = (): ActionFuncAsync<CallsVersionInfo> => {
    return bindClientFunc({
        clientFunc: () => RestClient.fetch<CallsVersionInfo>(
            `${getPluginPath()}/version`,
            {method: 'get'},
        ),
        onSuccess: [RECEIVED_CALLS_VERSION_INFO],
    });
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
        modalId: IdForErrorModel,
        dialogType: ErrorModal,
        dialogProps: {
            channelID,
            err,
        },
    }));
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
        const currentCallID = getCallIDForCurrentCall(getState());
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

/**
 * joinUser thunk handles the side effects of a participant joining the call
 * `isFromInitialSync` is for participants we're catching up on at connect time (already in the room when we joined).
 */
export const joinUser = (channelID: string, userID: string, sessionID: string, isFromInitialSync = false) => {
    return (dispatch: DispatchFunc, getState: GetStateFunc) => {
        const state = getState();
        const currentUserID = getCurrentUserId(state);
        const isOurSession = sessionID === getCallsClientSessionID();
        const isSameUser = userID === currentUserID;

        // Only play the join sound if we're in the call this event is about.
        if (window.callsClient?.channelID === channelID) {
            if (isOurSession) {
                playSound('join_self');
            } else if (!isFromInitialSync && !isSameUser && shouldPlayJoinUserSound(state)) {
                playSound('join_user');
            }
        }

        // Ringing should stop once you accept on one device, the other devices should stop ringing.
        if (ringingEnabled(state) && isSameUser) {
            const callID = getCallIDForChannel(state, channelID);
            dispatch(removeIncomingCallNotification(callID));
            notificationsStopRinging();
        }

        dispatch(loadProfilesByIdsIfMissing([userID]));

        const userJoinedAction = userJoined(channelID, sessionID, userID, currentUserID);
        const userJoinedTimeoutAction = {
            type: USER_JOINED_TIMEOUT,
            data: {
                channelID,
                userID,
            },
        };

        if (isFromInitialSync && !isOurSession) {
            // Catching up on a session that was already in the room when we
            // joined (could be another user, or another device of ours).
            dispatch(batchActions([userJoinedAction, userJoinedTimeoutAction]));
        } else {
            dispatch(userJoinedAction);

            // Auto-dismiss the "X joined" banner after a delay.
            setTimeout(() => dispatch(userJoinedTimeoutAction), JOINED_USER_NOTIFICATION_TIMEOUT);
        }
    };
};

export const callEnd = (channelID: string) => {
    return (dispatch: DispatchFunc, getState: GetStateFunc) => {
        const callID = getCallIDForChannel(getState(), channelID);

        dispatch(callEnded(channelID, callID));
        dispatch(removeIncomingCallNotification(callID));
    };
};

export const leaveUser = (channelID: string, userID: string, sessionID: string) => {
    return (dispatch: DispatchFunc, getState: GetStateFunc) => {
        dispatch(userLeft(channelID, sessionID, userID));

        if (numSessionsInCallInChannel(getState(), channelID) === 0) {
            const callID = getCallIDForChannel(getState(), channelID);
            dispatch(callEnded(channelID, callID));
            dispatch(removeIncomingCallNotification(callID));
        }
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

/**
 * Loads user profiles for any users not present in the Mattermost redux store and adds them.
 */
export const loadProfilesByIdsIfMissing = (userIDs: Array<UserProfile['id']>) => {
    return async (dispatch: DispatchFunc, getState: GetStateFunc) => {
        const missingUserIDs = [];
        for (const userID of userIDs) {
            if (!getUser(getState(), userID)) {
                missingUserIDs.push(userID);
            }
        }

        if (missingUserIDs.length === 0) {
            return;
        }

        try {
            const missedUserProfiles = await RestClient.getProfilesByIds(missingUserIDs);
            dispatch({type: UserTypes.RECEIVED_PROFILES, data: missedUserProfiles});
        } catch (err) {
            logErr(err);
        }
    };
};

export const hydradeCallsAndChannelStatesExcept = (skipChannelID?: string) => {
    return async (dispatch: DispatchFunc, getState: GetStateFunc) => {
        const actions: AnyAction[] = [];

        let callsAndChannelStates: CallChannelState[] = [];
        try {
            callsAndChannelStates = await RestClient.fetch<CallChannelState[]>(`${getPluginPath()}/channels`, {method: 'get'});
        } catch (err) {
            logErr(err);
            return;
        }

        for (const callAndChannelState of callsAndChannelStates) {
            if (!callAndChannelState) {
                continue;
            }

            // State for the current call should only be mutated from websocket events.
            if (skipChannelID && callAndChannelState.channel_id && skipChannelID === callAndChannelState.channel_id) {
                continue;
            }

            actions.push(channelCallsAvailabilityUpdated(callAndChannelState.channel_id, callAndChannelState.enabled));

            if (!callAndChannelState.call || !callAndChannelState.call.sessions || callAndChannelState.call.sessions.length === 0) {
                continue;
            }

            dispatch(loadProfilesByIdsIfMissing(getUserIDsFromSessions(callAndChannelState.call.sessions)));

            if (!callStartAtForCallInChannel(getState(), callAndChannelState.channel_id)) {
                actions.push(
                    activeCallAdded(callAndChannelState.channel_id, {
                        callID: callAndChannelState.call.id,
                        startAt: callAndChannelState.call.start_at,
                        ownerID: callAndChannelState.call.owner_id,
                        threadID: callAndChannelState.call.thread_id,
                    }),
                );

                actions.push(hostChanged(callAndChannelState.channel_id, callAndChannelState.call.host_id, callAndChannelState.call.start_at));

                actions.push(sessionsReceived(callAndChannelState.channel_id, getSessionsMapFromSessions(callAndChannelState.call.sessions)));

                if (ringingEnabled(getState())) {
                    // dismissedNotification is populated after the actions array has been batched, so manually check:
                    const dismissed = callAndChannelState.call.dismissed_notification;
                    if (dismissed) {
                        const currentUserID = getCurrentUserId(getState());
                        if (Object.hasOwn(dismissed, currentUserID) && dismissed[currentUserID]) {
                            actions.push({
                                type: DISMISS_CALL,
                                data: {
                                    callID: callAndChannelState.call.id,
                                },
                            });
                            continue;
                        }
                    }
                    dispatch(incomingCallOnChannel(callAndChannelState.channel_id, callAndChannelState.call.id, callAndChannelState.call.owner_id, callAndChannelState.call.start_at));
                }
            }
        }

        dispatch(batchActions(actions));
    };
};

/**
 * This is the hydration action for the call state. It is used to set the initial state of the call when the page is loaded.
 * It is used to set the initial state of the call when the page is loaded when for example user joins an ongoing call,
 * or a client drop the connection and reconnects after a period of time. It contains all the required
 * information to set the initial state of the call.
 */
export const loadCallState = (channelID: string, call: CallState) => (dispatch: DispatchFunc, getState: GetStateFunc) => {
    const actions: AnyAction[] = [];

    actions.push(
        activeCallAdded(channelID, {
            callID: call.id,
            startAt: call.start_at,
            threadID: call.thread_id,
            ownerID: call.owner_id,
        }),
    );

    const hostChangeAt = getHostChangeAt(getState(), channelID) ?? call.start_at;
    actions.push(hostChanged(channelID, call.host_id, hostChangeAt));

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

    if (call.screen_sharing_session_id) {
        const screenSharer = call.sessions.find((session) => session.session_id === call.screen_sharing_session_id);
        if (screenSharer?.user_id) {
            actions.push(userScreenShared(channelID, call.screen_sharing_session_id, screenSharer.user_id));
        }
    }

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
        dispatch(loadProfilesByIdsIfMissing(getUserIDsFromSessions(call.sessions)));
    }

    actions.push(sessionsReceived(channelID, getSessionsMapFromSessions(call.sessions)));

    dispatch(batchActions(actions));
};

export const setClientConnecting = (value: boolean) => (dispatch: Dispatch) => {
    dispatch({
        type: CLIENT_CONNECTING,
        data: value,
    });
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

export const openCallsUserSettings = (): ActionFuncAsync => {
    return async (dispatch: DispatchFunc) => {
        if (window.WebappUtils && window.WebappUtils.openUserSettings) {
            dispatch(window.WebappUtils.openUserSettings({activeTab: 'com.mattermost.calls', isContentProductSettings: true}));
        }
        return {};
    };
};

export const localSessionClose = (channelID: string) => (dispatch: Dispatch) => {
    dispatch({
        type: LOCAL_SESSION_CLOSE,
        data: {
            channelID,
        },
    });
};
