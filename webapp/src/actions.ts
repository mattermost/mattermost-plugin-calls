import {Dispatch} from 'redux';
import axios from 'axios';

import {ActionFunc, DispatchFunc, GenericAction, GetStateFunc} from 'mattermost-redux/types/actions';

import {bindClientFunc} from 'mattermost-redux/actions/helpers';

import {Client4} from 'mattermost-redux/client';

import {CloudCustomer} from '@mattermost/types/cloud';

import {isCurrentUserSystemAdmin} from 'mattermost-redux/selectors/entities/users';
import {getConfig} from 'mattermost-redux/selectors/entities/general';

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
    SHOW_EXPANDED_VIEW,
    HIDE_EXPANDED_VIEW,
    SHOW_SWITCH_CALL_MODAL,
    HIDE_SWITCH_CALL_MODAL,
    SHOW_SCREEN_SOURCE_MODAL,
    HIDE_SCREEN_SOURCE_MODAL,
    HIDE_END_CALL_MODAL,
    RECEIVED_CALLS_CONFIG,
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

export const endCall = (channelID: string) => {
    return axios.post(`${getPluginPath()}/calls/${channelID}/end`, null,
        {headers: {'X-Requested-With': 'XMLHttpRequest'}});
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
