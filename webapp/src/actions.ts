import {Dispatch} from 'redux';
import {ActionFunc, GenericAction} from 'mattermost-redux/types/actions';

import {bindClientFunc} from 'mattermost-redux/actions/helpers';

import {Client4} from 'mattermost-redux/client';

import {CloudInfo} from 'src/types/types';
import {getPluginPath} from 'src/utils';

import {
    SHOW_EXPANDED_VIEW,
    HIDE_EXPANDED_VIEW,
    SHOW_SWITCH_CALL_MODAL,
    HIDE_SWITCH_CALL_MODAL,
    SHOW_SCREEN_SOURCE_MODAL,
    HIDE_SCREEN_SOURCE_MODAL, RECEIVED_CLOUD_INFO,
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

export const getCloudInfo = (): ActionFunc => {
    return bindClientFunc({
        clientFunc: () => Client4.doFetch<CloudInfo>(
            `${getPluginPath()}/cloud`,
            {method: 'get'},
        ),
        onSuccess: [RECEIVED_CLOUD_INFO],
    });
};
