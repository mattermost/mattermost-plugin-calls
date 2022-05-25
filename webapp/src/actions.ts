import {Dispatch} from 'redux';
import {ActionFunc, DispatchFunc, GenericAction, GetStateFunc} from 'mattermost-redux/types/actions';

import {bindClientFunc} from 'mattermost-redux/actions/helpers';

import {Client4} from 'mattermost-redux/client';

import {CloudCustomer} from '@mattermost/types/cloud';

import {isCurrentUserSystemAdmin} from 'mattermost-redux/selectors/entities/users';

import {CallsConfig} from 'src/types/types';
import {getPluginPath} from 'src/utils';

import {modals, openPricingModal} from 'src/webapp_globals';
import {
    CloudFreeTrialErrorModal,
    CloudFreeTrialModalAdmin,
    CloudFreeTrialModalUser,
    CloudFreeTrialSuccessModal,
    IDAdmin, IDError,
    IDSuccess,
    IDUser,
} from 'src/cloud_pricing/modals';

import {
    SHOW_EXPANDED_VIEW,
    HIDE_EXPANDED_VIEW,
    SHOW_SWITCH_CALL_MODAL,
    HIDE_SWITCH_CALL_MODAL,
    SHOW_SCREEN_SOURCE_MODAL,
    HIDE_SCREEN_SOURCE_MODAL,
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

        openPricingModal()();
        return {};
    };
};

export const requestTrial = () => {
    return async (dispatch: DispatchFunc, getState: GetStateFunc) => {
        const isAdmin = isCurrentUserSystemAdmin(getState());
        if (!isAdmin) {
            return {};
        }

        const success = await requestCloudTrial();
        if (success) {
            dispatch(modals.openModal({
                modalId: IDSuccess,
                dialogType: CloudFreeTrialSuccessModal,
            }));
        } else {
            dispatch(modals.openModal({
                modalId: IDError,
                dialogType: CloudFreeTrialErrorModal,
            }));
        }
        return {};
    };
};
