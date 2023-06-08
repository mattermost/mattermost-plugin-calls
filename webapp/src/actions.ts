import {CallsConfig} from '@calls/common/lib/types';
import {getChannel as loadChannel} from 'mattermost-redux/actions/channels';
import {bindClientFunc} from 'mattermost-redux/actions/helpers';
import {getThread as fetchThread} from 'mattermost-redux/actions/threads';
import {getProfilesByIds as getProfilesByIdsAction} from 'mattermost-redux/actions/users';
import {Client4} from 'mattermost-redux/client';

import {ClientError} from 'mattermost-redux/client/client4';
import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getConfig} from 'mattermost-redux/selectors/entities/general';
import {isCollapsedThreadsEnabled} from 'mattermost-redux/selectors/entities/preferences';
import {getCurrentTeamId} from 'mattermost-redux/selectors/entities/teams';
import {getThread} from 'mattermost-redux/selectors/entities/threads';
import {getCurrentUserId, getUser, isCurrentUserSystemAdmin} from 'mattermost-redux/selectors/entities/users';

import {ActionFunc, DispatchFunc, GenericAction, GetStateFunc} from 'mattermost-redux/types/actions';

import {MessageDescriptor} from 'react-intl';
import {Dispatch} from 'redux';
import {batchActions} from 'redux-batched-actions';

import {CloudFreeTrialModalAdmin, CloudFreeTrialModalUser, IDAdmin, IDUser} from 'src/cloud_pricing/modals';
import {CallErrorModal, CallErrorModalID} from 'src/components/call_error_modal';
import {GenericErrorModal, IDGenericErrorModal} from 'src/components/generic_error_modal';
import {CallsInTestModeModal, IDTestModeUser} from 'src/components/modals';

import {channelHasCall, incomingCalls, voiceChannelCallDismissedNotification} from 'src/selectors';

import * as Telemetry from 'src/types/telemetry';
import {ChannelType} from 'src/types/types';
import {getPluginPath, isDMChannel, isGMChannel} from 'src/utils';
import {modals, openPricingModal} from 'src/webapp_globals';

import {
    ADD_INCOMING_CALL,
    CALL_HAS_ENDED,
    HAVE_RANG_FOR_CALL,
    HIDE_END_CALL_MODAL,
    HIDE_EXPANDED_VIEW,
    HIDE_SCREEN_SOURCE_MODAL,
    HIDE_SWITCH_CALL_MODAL,
    RECEIVED_CALLS_CONFIG,
    RECORDINGS_ENABLED,
    REMOVE_INCOMING_CALL,
    SHOW_EXPANDED_VIEW,
    SHOW_SCREEN_SOURCE_MODAL,
    SHOW_SWITCH_CALL_MODAL,
    VOICE_CHANNEL_CALL_REC_PROMPT_DISMISSED,
    VOICE_CHANNEL_CALL_RECORDING_STATE,
    VOICE_CHANNEL_USER_DISCONNECTED,
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
        clientFunc: () => Client4.doFetch<CallsConfig>(
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

export const notifyAdminCloudFreeTrial = async () => {
    return Client4.doFetch(
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
        const response = await Client4.doFetchWithResponse(
            `${Client4.getBaseRoute()}/trial-license`,
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
    return Client4.doFetch(
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
            clientType: window.desktop ? 'desktop' : 'web',
            source,
            props,
        };
        Client4.doFetch(
            `${getPluginPath()}/telemetry/track`,
            {method: 'post', body: JSON.stringify(eventData)},
        );
    };
};

export function prefetchThread(postId: string) {
    return async (dispatch: DispatchFunc, getState: GetStateFunc) => {
        const state = getState();
        const teamId = getCurrentTeamId(state);
        const currentUserId = getCurrentUserId(state);

        const thread = getThread(state, postId) ?? (await dispatch(fetchThread(currentUserId, teamId, postId, isCollapsedThreadsEnabled(state)))).data;

        return {data: thread};
    };
}

export const startCallRecording = (callID: string) => (dispatch: Dispatch<GenericAction>) => {
    Client4.doFetch(
        `${getPluginPath()}/calls/${callID}/recording/start`,
        {method: 'post'},
    ).catch((err) => {
        dispatch({
            type: VOICE_CHANNEL_CALL_RECORDING_STATE,
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
    return Client4.doFetch(
        `${getPluginPath()}/calls/${callID}/recording/stop`,
        {method: 'post'},
    );
};

export const recordingPromptDismissedAt = (callID: string, dismissedAt: number) => (dispatch: Dispatch<GenericAction>) => {
    dispatch({
        type: VOICE_CHANNEL_CALL_REC_PROMPT_DISMISSED,
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

export function incomingCallOnChannel(channelID: string, hostID: string, startAt: number) {
    return async (dispatch: DispatchFunc, getState: GetStateFunc) => {
        let channel = getChannel(getState(), channelID);
        if (!channel) {
            const res = await dispatch(loadChannel(channelID));
            channel = res.data;
        }

        if (channel && (isDMChannel(channel) || isGMChannel(channel))) {
            if (voiceChannelCallDismissedNotification(getState(), channelID)) {
                return;
            }

            const otherUser = getUser(getState(), hostID);
            if (!otherUser) {
                await dispatch(getProfilesByIdsAction([hostID]));
            }

            // if this is the first call in the list, it should ring.
            const calls = incomingCalls(getState());
            const ring = calls.length === 0;

            await dispatch({
                type: ADD_INCOMING_CALL,
                data: {
                    callID: channelID,
                    hostID,
                    startAt,
                    type: isDMChannel(channel) ? ChannelType.DM : ChannelType.GM,
                    ring,
                },
            });
        }
    };
}

export const userDisconnected = (channelID: string, userID: string) => {
    return async (dispatch: DispatchFunc, getState: GetStateFunc) => {
        await dispatch({
            type: VOICE_CHANNEL_USER_DISCONNECTED,
            data: {
                channelID,
                userID,
                currentUserID: getCurrentUserId(getState()),
            },
        });

        if (!channelHasCall(getState(), channelID)) {
            await dispatch({
                type: CALL_HAS_ENDED,
                data: {
                    callID: channelID,
                },
            });
        }
    };
};

export const dismissIncomingCallNotification = (callID: string, startAt: number) => {
    return async (dispatch: DispatchFunc) => {
        Client4.doFetch(
            `${getPluginPath()}/calls/${callID}/dismiss-notification`,
            {method: 'post'},
        );
        await dispatch(batchActions([
            {
                type: REMOVE_INCOMING_CALL,
                data: {
                    callID,
                },
            },
            {
                type: HAVE_RANG_FOR_CALL,
                data: {
                    callUniqueID: `${callID}${startAt}`,
                },
            },
        ]));
    };
};
