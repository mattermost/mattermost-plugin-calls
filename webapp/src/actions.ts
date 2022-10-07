import {Dispatch} from 'redux';
import axios from 'axios';

import {ActionFunc, DispatchFunc, GenericAction, GetStateFunc} from 'mattermost-redux/types/actions';

import {bindClientFunc} from 'mattermost-redux/actions/helpers';

import {Client4} from 'mattermost-redux/client';

import {CloudCustomer} from '@mattermost/types/cloud';

import {isCurrentUserSystemAdmin} from 'mattermost-redux/selectors/entities/users';
import {getConfig} from 'mattermost-redux/selectors/entities/general';

import {fetchAgendaForChannel, updateAgendaItem, addAgendaItem} from 'src/rest_client';

import {CallsConfig} from 'src/types/types';
import * as Telemetry from 'src/types/telemetry';
import {getPluginPath} from 'src/utils';

import {modals, openPricingModal} from 'src/webapp_globals';
import {
    CloudFreeTrialModalAdmin,
    CloudFreeTrialModalUser,
    IDAdmin,
    IDUser,
} from 'src/cloud_pricing/modals';

import {
    CallErrorModalID,
    CallErrorModal,
} from 'src/components/call_error_modal';

import {
    SHOW_EXPANDED_VIEW,
    HIDE_EXPANDED_VIEW,
    SHOW_NEXT_STEPS_MODAL,
    HIDE_NEXT_STEPS_MODAL,
    SHOW_SWITCH_CALL_MODAL,
    HIDE_SWITCH_CALL_MODAL,
    SHOW_SCREEN_SOURCE_MODAL,
    HIDE_SCREEN_SOURCE_MODAL,
    HIDE_END_CALL_MODAL,
    RECEIVED_CALLS_CONFIG,
    RECEIVED_CLIENT_ERROR,
    SET_CHECKLIST_COLLAPSED_STATE,
    SetChecklistCollapsedState,
    SET_CHECKLIST,
    SetChecklist,
    SetChecklistItem,
    SET_CHECKLIST_ITEM,
} from './action_types';
import {ChecklistItem} from './types/checklist';

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

export const showNextStepsModal = (targetID?: string) => (dispatch: Dispatch<GenericAction>) => {
    dispatch({
        type: SHOW_NEXT_STEPS_MODAL,
        data: {
            targetID,
        },
    });
};

export const hideNextStepsModal = () => (dispatch: Dispatch<GenericAction>) => {
    dispatch({
        type: HIDE_NEXT_STEPS_MODAL,
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

export const notifyAdminCloudFreeTrial = async () => {
    return Client4.doFetch(
        `${getPluginPath()}/cloud-notify-admins`,
        {method: 'post'},
    );
};

export const requestCloudTrial = async () => {
    try {
        await Client4.doFetchWithResponse<CloudCustomer>(
            `${Client4.getCloudRoute()}/request-trial`,
            {method: 'put'},
        );
    } catch (error) {
        return false;
    }
    return true;
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
        return {error: e.message, data: {status: e.status_code}};
    }
};

export const endCall = (channelID: string) => {
    return axios.post(`${getPluginPath()}/calls/${channelID}/end`, null,
        {headers: {'X-Requested-With': 'XMLHttpRequest'}});
};

export const displayCallErrorModal = (channelID: string, err: Error) => (dispatch: Dispatch<GenericAction>) => {
    dispatch({
        type: RECEIVED_CLIENT_ERROR,
        data: {
            channelID,
            err,
        },
    });
    dispatch(modals.openModal({
        modalId: CallErrorModalID,
        dialogType: CallErrorModal,
    }));
};

export const clearClientError = () => (dispatch: Dispatch<GenericAction>) => {
    dispatch({
        type: RECEIVED_CLIENT_ERROR,
        data: null,
    });
};

export const trackEvent = (event: Telemetry.Event, source: Telemetry.Source, props?: Record<string, any>) => {
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

export const setChecklistCollapsedState = (channelId: string, checklistIndex: number, collapsed: boolean): SetChecklistCollapsedState => ({
    type: SET_CHECKLIST_COLLAPSED_STATE,
    channelId,
    checklistIndex,
    collapsed,
});

export const getAgendaForChannel = (channelId: string) => {
    return async (dispatch: DispatchFunc) => {
        const checklist = await fetchAgendaForChannel(channelId);

        dispatch({
            type: SET_CHECKLIST,
            channelId,
            nextState: checklist,
        } as SetChecklist);
    };
};

export const updateAgendaItemForChannel = (channelId: string, item: ChecklistItem) => {
    return async (dispatch: DispatchFunc) => {
        await updateAgendaItem(channelId, item);

        dispatch({
            type: SET_CHECKLIST_ITEM,
            channelId,
            item,
        } as SetChecklistItem);
    };
};

export const addAgendaItemToChannel = (channelId: string, item: ChecklistItem) => {
    return async (dispatch: DispatchFunc) => {
        item = await addAgendaItem(channelId, item);

        dispatch({
            type: SET_CHECKLIST_ITEM,
            channelId,
            item,
        } as SetChecklistItem);
    };
};
