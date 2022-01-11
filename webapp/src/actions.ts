import {Dispatch} from 'redux';
import {GenericAction} from 'mattermost-redux/types/actions';

import {
    SHOW_EXPANDED_VIEW,
    HIDE_EXPANDED_VIEW,
    SHOW_SWITCH_CALL_MODAL,
    HIDE_SWITCH_CALL_MODAL,
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

export const showSwitchCallModal = () => (dispatch: Dispatch<GenericAction>) => {
    dispatch({
        type: SHOW_SWITCH_CALL_MODAL,
    });
};

export const hideSwitchCallModal = () => (dispatch: Dispatch<GenericAction>) => {
    dispatch({
        type: HIDE_SWITCH_CALL_MODAL,
    });
};
